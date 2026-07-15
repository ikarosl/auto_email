<script setup lang="ts">
import type { InquiryListItem } from '@email-inquiry/shared';
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  Lock,
  Move,
  MessageSquarePlus,
  RefreshCcw,
  ShieldAlert,
  Unlock,
} from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { WEB_ROUTES } from '@email-inquiry/shared';

import {
  createReplyDraft,
  fetchContextSnapshot,
  fetchInquiry,
  fetchInquiryMessages,
  fetchInquiryThread,
  linkMessageToInquiry,
  moveInquiryMessage,
  updateInquiry,
  updateInquiryProcessingMode,
  fetchStateDecisions,
  applyStateDecision,
  rejectStateDecision,
  submitStateCorrection,
  fetchBusinessEvents,
  fetchStateTransitions,
} from '@/api/backend';
import type {
  InquiryStateDecisionListItem,
  InquiryBusinessEventListItem,
  InquiryStateTransitionListItem,
} from '@/api/backend';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import JsonBlock from '@/components/workbench/JsonBlock.vue';
import PageHeader from '@/components/workbench/PageHeader.vue';
import { formatDateTime } from '@/lib/format';
import {
  getStageLabel,
  getOwnerLabel,
  getLifecycleLabel,
  stageTone,
  ownerTone,
  lifecycleTone,
  type InquiryBusinessStage,
  type InquiryActionOwner,
  type InquiryLifecycleStatus,
} from '@/types/inquiry-state';

const route = useRoute();
const loading = ref(false);
const error = ref('');
const item = ref<InquiryListItem | null>(null);
const messages = ref<any[]>([]);
const messagesTotal = ref(0);
const messagesPage = ref(1);
const messagesLimit = 30;
const messagesLoadingMore = ref(false);
const threadData = ref<any>(null);
const activeTab = ref<'messages' | 'thread' | 'context' | 'state'>('messages');
const stateDecisions = ref<InquiryStateDecisionListItem[]>([]);
const stateDecisionsTotal = ref(0);
const businessEvents = ref<InquiryBusinessEventListItem[]>([]);
const stateTransitions = ref<InquiryStateTransitionListItem[]>([]);

const editingSubject = ref(false);
const subjectDraft = ref('');
const saving = ref(false);
const successMsg = ref('');

const showCorrection = ref(false);
const correctionBusinessStage = ref<InquiryBusinessStage>('intake');
const correctionActionOwner = ref<InquiryActionOwner>('us');
const correctionLifecycleStatus = ref<InquiryLifecycleStatus>('active');
const correctionReason = ref('');

watch(correctionLifecycleStatus, (lifecycleStatus) => {
  if (lifecycleStatus !== 'active') {
    correctionActionOwner.value = 'none';
  } else if (correctionActionOwner.value === 'none') {
    correctionActionOwner.value = 'us';
  }
});

const showMoveDialog = ref(false);
const moveMessageId = ref('');
const moveTargetId = ref('');

const showLinkDialog = ref(false);
const linkEmailId = ref('');
const showDraftDialog = ref(false);
const draftCommercialTerms = ref('');

const showDecisionReview = ref(false);
const decisionReviewAction = ref<'apply' | 'reject'>('apply');
const decisionReviewId = ref('');
const decisionReviewReason = ref('');
const showProcessingModeDialog = ref(false);
const targetProcessingMode = ref<'automatic' | 'manual'>('manual');
const processingModeReason = ref('');

const email_source = {
  system_detected: '系统检测历史补录',
};

const hasMoreMessages = computed(() => messages.value.length < messagesTotal.value);
const fullSnapshot = ref<any>(null);

const currentStage = computed(() => (item.value as any)?.businessStage ?? 'intake');
const currentOwner = computed(() => (item.value as any)?.actionOwner ?? 'us');
const currentLifecycle = computed(() => (item.value as any)?.lifecycleStatus ?? 'active');
const currentProcessingMode = computed(() => item.value?.processingMode ?? 'automatic');
const latestStateDecision = computed(() => stateDecisions.value[0] ?? null);

const latestConfidencePercent = computed(() => {
  const confidence = Number(latestStateDecision.value?.confidence);
  return Number.isFinite(confidence) ? Math.round(confidence * 100) : null;
});
const latestRiskLevel = computed(() => latestStateDecision.value?.riskLevel ?? null);
const latestReason = computed(() => latestStateDecision.value?.executionReason ?? null);
const latestExecutionStatus = computed(() => latestStateDecision.value?.executionStatus ?? 'pending');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const inquiryId = String(route.params.id);
    messagesPage.value = 1;
    const [inquiryResult, messagesResult, threadResult, decisionsResult, eventsResult, transitionsResult] = await Promise.all([
      fetchInquiry(inquiryId),
      fetchInquiryMessages(inquiryId, { page: messagesPage.value, limit: messagesLimit }),
      fetchInquiryThread(inquiryId),
      fetchStateDecisions(inquiryId, { page: 1, limit: 50 }),
      fetchBusinessEvents(inquiryId, { page: 1, limit: 100 }),
      fetchStateTransitions(inquiryId, { page: 1, limit: 100 }),
    ]);
    item.value = inquiryResult;
    messages.value = messagesResult.data;
    messagesTotal.value = messagesResult.total;
    threadData.value = threadResult;
    stateDecisions.value = decisionsResult.data;
    stateDecisionsTotal.value = decisionsResult.total;
    businessEvents.value = eventsResult.data;
    stateTransitions.value = transitionsResult.data;
    const snapshotId = threadResult?.latestContextSnapshot?.id;
    fullSnapshot.value = snapshotId ? await fetchContextSnapshot(snapshotId) : null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function openDecisionReview(id: string, action: 'apply' | 'reject') {
  decisionReviewId.value = id;
  decisionReviewAction.value = action;
  decisionReviewReason.value = '';
  showDecisionReview.value = true;
}

async function submitDecisionReview() {
  if (!decisionReviewId.value) return;
  if (decisionReviewAction.value === 'reject' && !decisionReviewReason.value.trim()) return;
  saving.value = true;
  error.value = '';
  try {
    if (decisionReviewAction.value === 'apply') {
      await applyStateDecision(decisionReviewId.value, decisionReviewReason.value || undefined);
    } else {
      await rejectStateDecision(decisionReviewId.value, decisionReviewReason.value);
    }
    showDecisionReview.value = false;
    showSuccess(decisionReviewAction.value === 'apply' ? '状态决策已执行' : '状态决策已拒绝');
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

function openCorrection() {
  correctionBusinessStage.value = currentStage.value as InquiryBusinessStage;
  correctionActionOwner.value = currentOwner.value as InquiryActionOwner;
  correctionLifecycleStatus.value = currentLifecycle.value as InquiryLifecycleStatus;
  correctionReason.value = '';
  showCorrection.value = true;
}

async function submitCorrection() {
  if (!correctionReason.value.trim()) return;
  const actionOwner = correctionLifecycleStatus.value === 'active'
    ? correctionActionOwner.value
    : 'none';
  saving.value = true;
  error.value = '';
  try {
    await submitStateCorrection(String(route.params.id), {
      businessStage: correctionBusinessStage.value,
      actionOwner,
      lifecycleStatus: correctionLifecycleStatus.value,
      reason: correctionReason.value,
    });
    showCorrection.value = false;
    showSuccess('状态校正已提交');
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

function decisionStatusTone(status: string): 'success' | 'warning' | 'danger' | 'muted' {
  if (status === 'applied') return 'success';
  if (['pending', 'pending_review', 'dry_run', 'historical_backfill'].includes(status)) return 'warning';
  if (['failed', 'conflict', 'rejected'].includes(status)) return 'danger';
  return 'muted';
}

function eventTypeLabel(eventType: string) {
  return ({
    parameters_supplement: '参数补充',
    technical_solution: '技术方案',
    alternative_solution: '替代方案',
    delivery_negotiation: '交期协商',
    commercial_terms: '商业条件',
    formal_quote: '正式报价',
    contract: '合同',
    cancellation: '取消',
    confirmation_request: '确认请求',
    general_correspondence: '普通往来',
    business_event_corrected: '人工事件校正',
    manual_state_corrected: '人工状态校正',
  } as Record<string, string>)[eventType] || eventType;
}

async function loadNextMessages() {
  if (loading.value || messagesLoadingMore.value || !hasMoreMessages.value) return;
  messagesLoadingMore.value = true;
  error.value = '';
  try {
    messagesPage.value += 1;
    const result = await fetchInquiryMessages(String(route.params.id), { page: messagesPage.value, limit: messagesLimit });
    messages.value = mergeMessages(messages.value, result.data);
    messagesTotal.value = result.total;
  } catch (err) {
    messagesPage.value -= 1;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    messagesLoadingMore.value = false;
  }
}

function handleMessagesScroll(event: Event) {
  const target = event.currentTarget as HTMLElement;
  if (target.scrollHeight - target.scrollTop - target.clientHeight <= 120) void loadNextMessages();
}

async function saveSubject() {
  if (!item.value || !subjectDraft.value.trim()) return;
  saving.value = true;
  try {
    await updateInquiry(item.value.id, { businessSubject: subjectDraft.value });
    item.value.businessSubject = subjectDraft.value;
    editingSubject.value = false;
    showSuccess('业务主题已更新');
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally { saving.value = false; }
}

async function toggleLock() {
  if (!item.value) return;
  saving.value = true;
  try {
    await updateInquiry(item.value.id, { businessSubjectLocked: !item.value.businessSubjectLocked });
    item.value.businessSubjectLocked = !item.value.businessSubjectLocked;
    showSuccess(item.value.businessSubjectLocked ? '已锁定' : '已解锁');
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally { saving.value = false; }
}

function openProcessingModeDialog(mode: 'automatic' | 'manual') {
  targetProcessingMode.value = mode;
  processingModeReason.value = '';
  showProcessingModeDialog.value = true;
}

async function submitProcessingMode() {
  if (!item.value) return;
  if (targetProcessingMode.value === 'manual' && !processingModeReason.value.trim()) return;
  saving.value = true;
  error.value = '';
  try {
    const result = await updateInquiryProcessingMode(item.value.id, {
      mode: targetProcessingMode.value,
      reason: processingModeReason.value.trim() || undefined,
    });
    if (targetProcessingMode.value === 'automatic' && result.replayRun?.status !== 'completed') {
      throw new Error(result.replayRun?.errorMessage || '历史状态回补未完成，询盘继续保持人工模式。');
    }
    showProcessingModeDialog.value = false;
    showSuccess(targetProcessingMode.value === 'manual' ? '已切换人工处理' : '历史状态回补完成，已恢复自动处理');
    await load();
  } catch (err) {
    error.value = (err as any)?.response?.data?.message || (err instanceof Error ? err.message : String(err));
  } finally {
    saving.value = false;
  }
}

async function doMoveMessage() {
  if (!moveMessageId.value || !moveTargetId.value) return;
  saving.value = true;
  try {
    await moveInquiryMessage(moveMessageId.value, { targetInquiryCaseId: moveTargetId.value, reason: 'Manual correction' });
    showMoveDialog.value = false;
    moveTargetId.value = '';
    showSuccess('邮件已移动');
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally { saving.value = false; }
}

async function doLinkEmail() {
  if (!item.value || !linkEmailId.value) return;
  saving.value = true;
  try {
    await linkMessageToInquiry(item.value.id, { mode: 'link_existing_email', emailMessageId: linkEmailId.value });
    showLinkDialog.value = false;
    linkEmailId.value = '';
    showSuccess('邮件已关联');
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally { saving.value = false; }
}

async function doGenerateDraft() {
  if (!item.value) return;
  saving.value = true;
  try {
    await createReplyDraft(item.value.id, { commercialTerms: draftCommercialTerms.value.trim() || undefined });
    showDraftDialog.value = false;
    draftCommercialTerms.value = '';
    showSuccess('回复草稿已生成');
    await load();
  } catch (err) {
    error.value = (err as any)?.response?.data?.message || (err instanceof Error ? err.message : String(err));
  } finally { saving.value = false; }
}

function showSuccess(msg: string) {
  successMsg.value = msg;
  setTimeout(() => { successMsg.value = ''; }, 3000);
}

function mergeMessages(current: any[], incoming: any[]) {
  const seen = new Set(current.map((m) => m.emailMessageId));
  return [...current, ...incoming.filter((m) => !seen.has(m.emailMessageId))];
}

onMounted(load);
</script>

<template>
  <section class="space-y-4">
    <RouterLink :to="WEB_ROUTES.inquiries">
      <Button variant="ghost" size="sm"><ArrowLeft class="h-4 w-4" /> 返回询盘列表</Button>
    </RouterLink>
    <PageHeader title="询盘详情" :description="item?.businessSubject || item?.subject || ''" :loading="loading" @refresh="load" />
    <Card v-if="successMsg" class="border-green-200 bg-green-50 p-4 text-green-700">{{ successMsg }}</Card>
    <Card v-if="error" class="border-red-200 bg-red-50 p-4 text-red-700">{{ error }}</Card>

    <div v-if="item" class="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card class="p-4">
        <div class="space-y-4">
          <div><div class="text-sm text-muted-foreground">业务阶段</div><div class="mt-1"><Badge :tone="stageTone(currentStage)">{{ getStageLabel(currentStage) }}</Badge></div></div>
          <div><div class="text-sm text-muted-foreground">等待方</div><div class="mt-1"><Badge :tone="ownerTone(currentOwner)">{{ getOwnerLabel(currentOwner) }}</Badge></div></div>
          <div>
            <div class="text-sm text-muted-foreground">生命周期</div>
            <div class="mt-1"><Badge :tone="lifecycleTone(currentLifecycle)">{{ getLifecycleLabel(currentLifecycle) }}</Badge></div>
            <div class="mt-2"><Button size="sm" variant="outline" @click="openCorrection()">校正</Button></div>
          </div>
          <div class="rounded-md border border-border p-3">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="text-sm text-muted-foreground">处理模式</div>
                <Badge class="mt-1" :tone="currentProcessingMode === 'manual' ? 'warning' : 'success'">
                  {{ currentProcessingMode === 'manual' ? '人工处理' : '自动处理' }}
                </Badge>
              </div>
              <Button
                size="sm"
                variant="outline"
                @click="openProcessingModeDialog(currentProcessingMode === 'manual' ? 'automatic' : 'manual')"
              >
                {{ currentProcessingMode === 'manual' ? '恢复自动' : '转人工' }}
              </Button>
            </div>
            <p v-if="item.processingModeReason" class="mt-2 text-xs text-muted-foreground">
              {{ item.processingModeReason }}
            </p>
            <p v-if="currentProcessingMode === 'manual'" class="mt-2 text-xs text-amber-700">
              新邮件只入库和归并，不执行 AI 分析、状态流转或草稿生成。
            </p>
          </div>
          <div>
            <div class="text-sm text-muted-foreground">业务主题</div>
            <div class="mt-1 flex items-center gap-2">
              <span v-if="!editingSubject" class="font-medium">{{ item.businessSubject || '(未设置)' }}</span>
              <input v-else v-model="subjectDraft" class="flex-1 rounded border px-2 py-1 text-sm" @keyup.enter="saveSubject" />
              <Button v-if="!editingSubject" size="sm" variant="ghost" style="background-color:#bbf7d0;" @click="subjectDraft = item.businessSubject || ''; editingSubject = true">编辑</Button>
              <Button v-else size="sm" variant="default" :disabled="saving" @click="saveSubject">保存</Button>
            </div>
            <div class="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Lock v-if="item.businessSubjectLocked" class="h-3 w-3" /><Unlock v-else class="h-3 w-3" />
              <span>{{ item.businessSubjectLocked ? '已锁定' : '未锁定' }}</span>
              <Button size="sm" variant="ghost" @click="toggleLock">{{ item.businessSubjectLocked ? '解锁' : '锁定' }}</Button>
            </div>
          </div>
          <div><div class="text-sm text-muted-foreground">客户</div><div class="mt-1 font-medium">{{ item.customer?.name || item.customer?.email }}</div><div class="text-sm text-muted-foreground">{{ item.customer?.email }}</div></div>
          <div v-if="item.organization"><div class="text-sm text-muted-foreground">组织</div><div class="mt-1">{{ item.organization.name }}</div></div>
          <div><div class="text-sm text-muted-foreground">最新邮件</div><div class="mt-1">{{ formatDateTime(item.latestMessageAt) }}</div></div>
          <div class="flex flex-wrap gap-2">
            <Badge tone="muted">邮件 {{ item.counts?.inquiryMessages ?? 0 }}</Badge>
            <Badge tone="muted">AI {{ item.counts?.analysisDecisions ?? 0 }}</Badge>
            <Badge tone="muted">快照 {{ item.counts?.contextSnapshots ?? 0 }}</Badge>
          </div>
          <div class="flex flex-col gap-2">
            <Button size="sm" variant="outline" @click="showLinkDialog = true"><ExternalLink class="h-4 w-4" /> 关联邮件</Button>
          </div>
        </div>
      </Card>

      <div class="space-y-4">
        <div class="flex gap-2 border-b">
          <button class="px-3 py-2 text-sm font-medium" :class="activeTab === 'messages' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'" @click="activeTab = 'messages'">邮件时间线</button>
          <button class="px-3 py-2 text-sm font-medium" :class="activeTab === 'thread' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'" @click="activeTab = 'thread'">聚合视图</button>
          <button class="px-3 py-2 text-sm font-medium" :class="activeTab === 'context' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'" @click="activeTab = 'context'">上下文</button>
          <button class="px-3 py-2 text-sm font-medium" :class="activeTab === 'state' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'" @click="activeTab = 'state'">状态记录 {{ stateDecisionsTotal }}</button>
        </div>

        <div v-if="activeTab === 'messages'" class="max-h-[720px] space-y-3 overflow-y-auto pr-1 border-b border-gray-200" @scroll.passive="handleMessagesScroll">
          <div v-for="msg in messages" :key="msg.emailMessageId" class="rounded-lg border p-3">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2">
                <Badge :tone="msg.direction === 'inbound' ? 'default' : 'warning'">{{ msg.direction === 'inbound' ? '客户' : '我方' }}</Badge>
                <span class="font-medium">{{ msg.subject || '(无主题)' }}</span>
              </div>
              <div class="flex items-center gap-1">
                <Badge v-if="msg.source !== 'imap'" tone="muted" size="sm">{{ email_source['system_detected'] }}</Badge>
                <Button size="sm" variant="ghost" @click="moveMessageId = msg.emailMessageId; showMoveDialog = true"><Move class="h-3 w-3" /></Button>
              </div>
            </div>
            <div class="mt-1 text-xs text-muted-foreground">{{ msg.fromName || msg.fromEmail }} — {{ formatDateTime(msg.receivedAt) }}</div>
            <div v-if="msg.bodyTextPreview" class="mt-1 text-sm line-clamp-2">{{ msg.bodyTextPreview }}</div>
          </div>
          <div v-if="messages.length === 0" class="py-8 text-center text-sm text-muted-foreground">暂无关联邮件</div>
        </div>

        <div v-if="activeTab === 'thread' && threadData">
          <Card class="p-4">
            <div class="flex items-center gap-2">
              <BrainCircuit class="h-4 w-4 text-primary" />
              <h2 class="font-semibold">最新状态决策</h2>
              <Badge v-if="latestStateDecision" :tone="decisionStatusTone(latestStateDecision.executionStatus)">{{ latestStateDecision.executionStatus }}</Badge>
            </div>
            <div v-if="latestStateDecision" class="mt-4 space-y-4">
              <div class="grid gap-3 md:grid-cols-4">
                <div class="rounded-md border border-border bg-muted/30 p-3"><div class="text-xs text-muted-foreground">建议业务阶段</div><div class="mt-2 text-sm font-medium">{{ getStageLabel(latestStateDecision.suggestedBusinessStage) }}</div></div>
                <div class="rounded-md border border-border bg-muted/30 p-3"><div class="text-xs text-muted-foreground">建议等待方</div><div class="mt-2 text-sm font-medium">{{ getOwnerLabel(latestStateDecision.suggestedActionOwner) }}</div></div>
                <div class="rounded-md border border-border bg-muted/30 p-3"><div class="text-xs text-muted-foreground">建议生命周期</div><div class="mt-2 text-sm font-medium">{{ getLifecycleLabel(latestStateDecision.suggestedLifecycleStatus) }}</div></div>
                <div class="rounded-md border border-border bg-muted/30 p-3"><div class="text-xs text-muted-foreground">置信度</div><div class="mt-2 flex items-center gap-2 text-sm font-medium"><span>{{ latestConfidencePercent == null ? '-' : `${latestConfidencePercent}%` }}</span><Badge :tone="latestRiskLevel === 'high' ? 'danger' : latestRiskLevel === 'medium' ? 'warning' : 'muted'">{{ latestRiskLevel || '-' }}</Badge></div></div>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <div class="rounded-md border border-border p-3"><div class="flex items-center gap-2 text-sm font-medium"><CheckCircle2 class="h-4 w-4 text-emerald-600" /> 判断原因</div><p class="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{{ latestReason || '暂无原因' }}</p></div>
                <div class="rounded-md border border-border p-3"><div class="flex items-center gap-2 text-sm font-medium"><ShieldAlert class="h-4 w-4 text-amber-600" /> 状态影响</div><div class="mt-3 space-y-1 text-sm"><div>{{ getStageLabel(latestStateDecision.beforeBusinessStage) }} → {{ getStageLabel(latestStateDecision.suggestedBusinessStage) }}</div><div>{{ getOwnerLabel(latestStateDecision.beforeActionOwner) }} → {{ getOwnerLabel(latestStateDecision.suggestedActionOwner) }}</div><div>{{ getLifecycleLabel(latestStateDecision.beforeLifecycleStatus) }} → {{ getLifecycleLabel(latestStateDecision.suggestedLifecycleStatus) }}</div></div></div>
              </div>
              <div class="flex flex-wrap gap-2">
                <Badge :tone="latestStateDecision.humanReviewAdvisory ? 'warning' : 'muted'">{{ latestStateDecision.humanReviewAdvisory ? '建议人工复核' : '无需额外复核' }}</Badge>
                <Badge v-if="latestStateDecision.eventValidationPassed === false" tone="danger">事件校验未通过</Badge>
                <Badge v-if="latestStateDecision.baselineIncomplete" tone="warning">基线不完整</Badge>
              </div>
              <div v-if="['pending','pending_review','dry_run','historical_backfill','rejected','conflict'].includes(latestStateDecision.executionStatus)" class="flex justify-end gap-2">
                <Button size="sm" variant="outline" @click="openDecisionReview(latestStateDecision.id, 'reject')">拒绝</Button>
                <Button size="sm" @click="openDecisionReview(latestStateDecision.id, 'apply')">应用建议</Button>
              </div>
            </div>
            <div v-else class="mt-4 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">暂无状态决策</div>
          </Card>

          <Card class="mt-4 p-4">
            <h2 class="font-semibold mb-3">状态流转记录 ({{ stateTransitions.length }})</h2>
            <div v-for="t in stateTransitions" :key="t.id" class="border-l-2 border-border pl-4 pb-4 last:pb-0">
              <div class="text-xs text-muted-foreground">{{ formatDateTime(t.eventOccurredAt) }}</div>
              <div class="mt-1 flex flex-wrap items-center gap-1 text-sm">
                <Badge :tone="stageTone(t.fromBusinessStage)" size="sm">{{ getStageLabel(t.fromBusinessStage) }}</Badge><span class="text-muted-foreground">→</span><Badge :tone="stageTone(t.toBusinessStage)" size="sm">{{ getStageLabel(t.toBusinessStage) }}</Badge>
                <span class="mx-1 text-muted-foreground">·</span>
                <Badge :tone="ownerTone(t.fromActionOwner)" size="sm">{{ getOwnerLabel(t.fromActionOwner) }}</Badge><span class="text-muted-foreground">→</span><Badge :tone="ownerTone(t.toActionOwner)" size="sm">{{ getOwnerLabel(t.toActionOwner) }}</Badge>
                <span class="mx-1 text-muted-foreground">·</span>
                <Badge :tone="lifecycleTone(t.fromLifecycleStatus)" size="sm">{{ getLifecycleLabel(t.fromLifecycleStatus) }}</Badge><span class="text-muted-foreground">→</span><Badge :tone="lifecycleTone(t.toLifecycleStatus)" size="sm">{{ getLifecycleLabel(t.toLifecycleStatus) }}</Badge>
              </div>
              <div v-if="t.reason" class="mt-1 text-xs text-muted-foreground">{{ t.reason }}</div>
              <div class="mt-1 text-xs text-muted-foreground">{{ t.changedByType === 'ai' ? 'AI 自动' : t.changedByType === 'human' ? '人工操作' : t.changedByType }}</div>
            </div>
            <div v-if="stateTransitions.length === 0" class="py-4 text-center text-sm text-muted-foreground">暂无状态变更</div>
          </Card>

          <Card class="mt-4 p-4">
            <h2 class="font-semibold mb-3">业务事件 ({{ businessEvents.length }})</h2>
            <div v-for="e in businessEvents" :key="e.id" class="border-b border-border py-3 last:border-b-0">
              <div class="flex items-center gap-2"><span class="text-sm font-medium">{{ eventTypeLabel(e.eventType) }}</span><Badge tone="muted" size="sm">{{ e.sourceType === 'ai' ? 'AI' : '人工' }}</Badge></div>
              <div class="text-xs text-muted-foreground mt-1">{{ formatDateTime(e.occurredAt) }} · {{ e.actor }}</div>
              <div v-if="e.evidence" class="mt-1 text-sm text-muted-foreground">{{ e.evidence }}</div>
            </div>
            <div v-if="businessEvents.length === 0" class="py-4 text-center text-sm text-muted-foreground">暂无业务事件</div>
          </Card>
        </div>

        <div v-if="activeTab === 'context'">
          <Card class="p-4"><h2 class="font-semibold">最新快照</h2><div class="mt-3"><JsonBlock :value="fullSnapshot?.messages || threadData?.latestContextSnapshot || {}" /></div></Card>
          <Card class="mt-4 p-4"><h2 class="font-semibold">最新草稿</h2><div class="mt-3"><JsonBlock :value="threadData?.latestDraft || {}" /></div></Card>
        </div>

        <div v-if="activeTab === 'state'" class="max-h-[720px] overflow-y-auto border-b border-border">
          <div v-for="decision in stateDecisions" :key="decision.id" class="border-b border-border px-4 py-4 last:border-b-0">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium">状态决策</span>
                  <Badge :tone="decisionStatusTone(decision.executionStatus)">{{ decision.executionStatus }}</Badge>
                  <Badge tone="muted">{{ decision.decisionSource === 'ai' ? 'AI' : '人工' }}</Badge>
                  <Badge v-if="decision.baselineIncomplete" tone="warning">基线不完整</Badge>
                </div>
                <div class="mt-1 text-xs text-muted-foreground">{{ formatDateTime(decision.eventOccurredAt) }}<span v-if="decision.emailMessage"> · {{ decision.emailMessage.subject || decision.emailMessage.fromEmail }}</span></div>
              </div>
              <div class="text-right text-xs text-muted-foreground"><div>{{ decision.confidence == null ? '-' : `${Math.round(decision.confidence * 100)}%` }}</div><div>{{ decision.riskLevel || '-' }}</div></div>
            </div>
            <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div class="rounded-md border border-border bg-muted/20 p-2"><span class="text-muted-foreground">业务阶段</span><div class="mt-1 font-medium">{{ getStageLabel(decision.beforeBusinessStage) }}<span v-if="decision.suggestedBusinessStage !== decision.beforeBusinessStage" class="text-primary"> → {{ getStageLabel(decision.suggestedBusinessStage) }}</span></div></div>
              <div class="rounded-md border border-border bg-muted/20 p-2"><span class="text-muted-foreground">等待方</span><div class="mt-1 font-medium">{{ getOwnerLabel(decision.beforeActionOwner) }}<span v-if="decision.suggestedActionOwner !== decision.beforeActionOwner" class="text-primary"> → {{ getOwnerLabel(decision.suggestedActionOwner) }}</span></div></div>
              <div class="rounded-md border border-border bg-muted/20 p-2"><span class="text-muted-foreground">生命周期</span><div class="mt-1 font-medium">{{ getLifecycleLabel(decision.beforeLifecycleStatus) }}<span v-if="decision.suggestedLifecycleStatus !== decision.beforeLifecycleStatus" class="text-primary"> → {{ getLifecycleLabel(decision.suggestedLifecycleStatus) }}</span></div></div>
            </div>
            <div v-if="decision.appliedBusinessStage" class="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div class="rounded-md border border-green-200 bg-green-50 p-2"><span class="text-green-700">已应用: {{ getStageLabel(decision.appliedBusinessStage) }}</span></div>
              <div v-if="decision.appliedActionOwner" class="rounded-md border border-green-200 bg-green-50 p-2"><span class="text-green-700">已应用: {{ getOwnerLabel(decision.appliedActionOwner) }}</span></div>
              <div v-if="decision.appliedLifecycleStatus" class="rounded-md border border-green-200 bg-green-50 p-2"><span class="text-green-700">已应用: {{ getLifecycleLabel(decision.appliedLifecycleStatus) }}</span></div>
            </div>
            <p class="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{{ decision.executionReason || '暂无说明' }}</p>
            <div class="mt-2 flex flex-wrap gap-1">
              <Badge v-if="decision.eventValidationPassed === false" tone="danger">事件校验未通过</Badge>
              <Badge v-if="decision.humanReviewAdvisory" tone="warning">建议人工复核</Badge>
            </div>
            <div v-if="['pending','pending_review','dry_run','historical_backfill','rejected','conflict'].includes(decision.executionStatus)" class="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="outline" @click="openDecisionReview(decision.id, 'reject')">拒绝</Button>
              <Button size="sm" @click="openDecisionReview(decision.id, 'apply')">应用建议</Button>
            </div>
          </div>
          <div v-if="stateDecisions.length === 0" class="py-12 text-center text-sm text-muted-foreground">暂无状态决策记录</div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showProcessingModeDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="showProcessingModeDialog = false">
        <Card class="w-full max-w-md p-4">
          <h2 class="font-semibold">{{ targetProcessingMode === 'manual' ? '切换人工处理' : '恢复自动处理' }}</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ targetProcessingMode === 'manual'
              ? '切换后新邮件只入库和归并，AI 分析、状态流转和草稿生成都会暂停。'
              : '系统会先按邮件时间线执行状态回补；只有回补完整成功后才恢复自动处理。' }}
          </p>
          <div v-if="targetProcessingMode === 'manual'" class="mt-3">
            <label class="text-sm text-muted-foreground">原因（必填）</label>
            <textarea v-model="processingModeReason" rows="3" class="mt-1 w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <Button variant="ghost" @click="showProcessingModeDialog = false">取消</Button>
            <Button
              :disabled="saving || (targetProcessingMode === 'manual' && !processingModeReason.trim())"
              @click="submitProcessingMode"
            >{{ saving ? '处理中...' : '确认' }}</Button>
          </div>
        </Card>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showCorrection" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="showCorrection = false">
        <Card class="w-full max-w-md p-4">
          <h2 class="font-semibold">人工状态校正</h2>
          <p class="mt-1 text-sm text-muted-foreground">会新增校正事件并进入状态决策。</p>
          <div class="mt-3 space-y-3">
            <div><label class="text-sm text-muted-foreground">业务阶段</label><select v-model="correctionBusinessStage" class="mt-1 w-full rounded border px-2 py-1"><option value="intake">需求接入</option><option value="technical_review">技术评审</option><option value="commercial">商务阶段</option><option value="contract">合同阶段</option></select></div>
            <div>
              <label class="text-sm text-muted-foreground">等待方</label>
              <select
                v-model="correctionActionOwner"
                class="mt-1 w-full rounded border px-2 py-1 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                :disabled="correctionLifecycleStatus !== 'active'"
              >
                <option value="us">等待我方</option>
                <option value="customer">等待客户</option>
                <option value="none">无需等待</option>
              </select>
              <p v-if="correctionLifecycleStatus !== 'active'" class="mt-1 text-xs text-muted-foreground">
                终态询盘没有后续等待方，系统将自动设为“无需等待”。
              </p>
            </div>
            <div><label class="text-sm text-muted-foreground">生命周期</label><select v-model="correctionLifecycleStatus" class="mt-1 w-full rounded border px-2 py-1"><option value="active">进行中</option><option value="won">已成交</option><option value="lost">已丢单</option><option value="invalid">无效</option></select></div>
            <div><label class="text-sm text-muted-foreground">原因（必填）</label><textarea v-model="correctionReason" class="mt-1 w-full rounded border px-2 py-1 text-sm" rows="2" /></div>
            <div class="flex justify-end gap-2">
              <Button variant="ghost" @click="showCorrection = false">取消</Button>
              <Button :disabled="!correctionReason.trim() || saving" @click="submitCorrection">{{ saving ? '处理中...' : '确认校正' }}</Button>
            </div>
          </div>
        </Card>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showDecisionReview" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="showDecisionReview = false">
        <Card class="w-full max-w-md p-4">
          <h2 class="font-semibold">{{ decisionReviewAction === 'apply' ? '应用状态建议' : '拒绝状态建议' }}</h2>
          <p class="mt-1 text-sm text-muted-foreground">应用操作经状态机校验，使用条件更新避免覆盖其他操作。</p>
          <div class="mt-3"><label class="text-sm text-muted-foreground">原因{{ decisionReviewAction === 'reject' ? '（必填）' : '（可选）' }}</label><textarea v-model="decisionReviewReason" rows="3" class="mt-1 w-full rounded border px-3 py-2 text-sm" /></div>
          <div class="mt-4 flex justify-end gap-2">
            <Button variant="ghost" @click="showDecisionReview = false">取消</Button>
            <Button :disabled="saving || (decisionReviewAction === 'reject' && !decisionReviewReason.trim())" @click="submitDecisionReview">{{ saving ? '处理中...' : '确认' }}</Button>
          </div>
        </Card>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showMoveDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="showMoveDialog = false">
        <Card class="w-full max-w-md p-4">
          <h2 class="font-semibold">移动邮件到其他询盘</h2>
          <div class="mt-3 space-y-3"><div><label class="text-sm text-muted-foreground">目标询盘 ID</label><input v-model="moveTargetId" class="mt-1 w-full rounded border px-2 py-1" placeholder="如: inquiry_xxx" /></div>
          <div class="flex justify-end gap-2"><Button variant="ghost" @click="showMoveDialog = false">取消</Button><Button :disabled="!moveTargetId || saving" @click="doMoveMessage">{{ saving ? '处理中...' : '确认移动' }}</Button></div></div>
        </Card>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showLinkDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="showLinkDialog = false">
        <Card class="w-full max-w-md p-4">
          <h2 class="font-semibold">关联已有邮件</h2>
          <div class="mt-3 space-y-3"><div><label class="text-sm text-muted-foreground">邮件 ID</label><input v-model="linkEmailId" class="mt-1 w-full rounded border px-2 py-1" placeholder="如: email_xxx" /></div>
          <div class="flex justify-end gap-2"><Button variant="ghost" @click="showLinkDialog = false">取消</Button><Button :disabled="!linkEmailId || saving" @click="doLinkEmail">{{ saving ? '处理中...' : '确认关联' }}</Button></div></div>
        </Card>
      </div>
    </Teleport>
  </section>
</template>
