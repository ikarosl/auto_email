<script setup lang="ts">
import type { EmailWorkflowDecisionListItem, InquiryListItem, InquiryStatus } from '@email-inquiry/shared';
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
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { getInquiryStatusLabel, WEB_ROUTES } from '@email-inquiry/shared';

import {
  createReplyDraft,
  fetchContextSnapshot,
  fetchInquiry,
  fetchInquiryMessages,
  fetchInquiryThread,
  linkMessageToInquiry,
  moveInquiryMessage,
  transitionInquiryStatus,
  updateInquiry,
  applyWorkflowDecision,
  fetchInquiryWorkflowDecisions,
  rejectWorkflowDecision,
} from '@/api/backend';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import JsonBlock from '@/components/workbench/JsonBlock.vue';
import PageHeader from '@/components/workbench/PageHeader.vue';
import StatusPill from '@/components/workbench/StatusPill.vue';
import { formatDateTime } from '@/lib/format';

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
const activeTab = ref<'messages' | 'thread' | 'context' | 'events'>('messages');
const workflowDecisions = ref<EmailWorkflowDecisionListItem[]>([]);
const workflowTotal = ref(0);

// Editing state
const editingSubject = ref(false);
const subjectDraft = ref('');
const saving = ref(false);
const successMsg = ref('');

// Transition state
const showTransition = ref(false);
const transitionStatus = ref('');
const transitionReason = ref('');

// Move message state
const showMoveDialog = ref(false);
const moveMessageId = ref('');
const moveTargetId = ref('');

// Link email state
const showLinkDialog = ref(false);
const linkEmailId = ref('');
const showDraftDialog = ref(false);
const draftCommercialTerms = ref('');
const showWorkflowReview = ref(false);
const workflowReviewAction = ref<'apply' | 'reject'>('apply');
const workflowReviewId = ref('');
const workflowReviewReason = ref('');

const email_source={
  system_detected: '系统检测历史补录',
}

const hasMoreMessages = computed(() => messages.value.length < messagesTotal.value);
const allowedTransitionStatuses = computed<InquiryStatus[]>(() => {
  const allowed = threadData.value?.allowedTransitions?.allowedNextStatuses;
  return Array.isArray(allowed) ? allowed : [];
});
const fullSnapshot = ref<any>(null);
const latestAiDecision = computed(() => threadData.value?.latestAiDecision ?? null);
const latestWorkflowDecision = computed(() => workflowDecisions.value[0] ?? null);
const latestProcessDecision = computed(() => {
  const inbound = latestAiDecision.value;
  const outbound = latestWorkflowDecision.value;
  if (!inbound) return outbound ? { kind: 'outbound' as const, value: outbound } : null;
  if (!outbound) return { kind: 'inbound' as const, value: inbound };

  return timestampOf(outbound.createdAt) > timestampOf(inbound.createdAt)
    ? { kind: 'outbound' as const, value: outbound }
    : { kind: 'inbound' as const, value: inbound };
});
const latestProcessConfidencePercent = computed(() => {
  const confidence = Number(latestProcessDecision.value?.value.confidence);
  return Number.isFinite(confidence) ? Math.round(confidence * 100) : null;
});
const latestAiMissingFields = computed(() => normalizeStringList(latestAiDecision.value?.missingFields));
const latestProcessSuggestedStatus = computed(() => latestProcessDecision.value?.value.suggestedStatus ?? null);
const latestProcessCreatedAt = computed(() => latestProcessDecision.value?.value.createdAt ?? null);
const latestProcessRiskLevel = computed(() => latestProcessDecision.value?.value.riskLevel ?? null);
const latestProcessReason = computed(() => latestProcessDecision.value?.value.reason ?? null);
const latestProcessExecutionStatus = computed(() => latestProcessDecision.value?.value.executionStatus ?? 'not_evaluated');
const latestProcessFromStatus = computed(() => latestProcessDecision.value?.value.executionFromStatus ?? item.value?.status ?? null);
const latestProcessToStatus = computed(() => latestProcessDecision.value?.value.executionToStatus
  ?? latestProcessSuggestedStatus.value);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const inquiryId = String(route.params.id);
    messagesPage.value = 1;
    const [inquiryResult, messagesResult, threadResult, workflowResult] = await Promise.all([
      fetchInquiry(inquiryId),
      fetchInquiryMessages(inquiryId, { page: messagesPage.value, limit: messagesLimit }),
      fetchInquiryThread(inquiryId),
      fetchInquiryWorkflowDecisions(inquiryId, { page: 1, limit: 50 }),
    ]);
    item.value = inquiryResult;
    messages.value = messagesResult.data;
    messagesTotal.value = messagesResult.total;
    threadData.value = threadResult;
    workflowDecisions.value = workflowResult.data;
    workflowTotal.value = workflowResult.total;

    // 如果有最新快照 ID，拉取完整快照数据（含 contextPayload）
    const snapshotId = threadResult?.latestContextSnapshot?.id;
    if (snapshotId) {
      fullSnapshot.value = await fetchContextSnapshot(snapshotId);
    } else {
      fullSnapshot.value = null;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function openWorkflowReview(id: string, action: 'apply' | 'reject') {
  workflowReviewId.value = id;
  workflowReviewAction.value = action;
  workflowReviewReason.value = '';
  showWorkflowReview.value = true;
}

async function submitWorkflowReview() {
  if (!workflowReviewId.value) return;
  if (workflowReviewAction.value === 'reject' && !workflowReviewReason.value.trim()) return;
  saving.value = true;
  error.value = '';
  try {
    if (workflowReviewAction.value === 'apply') {
      await applyWorkflowDecision(workflowReviewId.value, { reason: workflowReviewReason.value || undefined });
    } else {
      await rejectWorkflowDecision(workflowReviewId.value, { reason: workflowReviewReason.value });
    }
    showWorkflowReview.value = false;
    showSuccess(workflowReviewAction.value === 'apply' ? '邮件事件已应用' : '邮件事件已拒绝');
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

function workflowStatusTone(status: string): 'success' | 'warning' | 'danger' | 'muted' {
  if (status === 'applied') return 'success';
  if (['pending', 'dry_run', 'historical_backfill'].includes(status)) return 'warning';
  if (['failed', 'conflict', 'rejected'].includes(status)) return 'danger';
  return 'muted';
}

function workflowEventLabel(eventType: string) {
  return ({
    customer_response_requested: '等待客户回复',
    engineer_review_acknowledgement: '工程审核确认',
    technical_solution_sent: '已发送技术方案',
    commercial_terms_sent: '已发送商业条件',
    formal_quote_sent: '已发送正式报价',
    contract_sent: '已发送合同',
    general_correspondence: '普通往来',
    unrelated_internal: '内部无关邮件',
    analysis_failed: '识别失败',
  } as Record<string, string>)[eventType] || eventType;
}

async function loadNextMessages() {
  if (loading.value || messagesLoadingMore.value || !hasMoreMessages.value) return;
  messagesLoadingMore.value = true;
  error.value = '';
  try {
    messagesPage.value += 1;
    const result = await fetchInquiryMessages(String(route.params.id), {
      page: messagesPage.value,
      limit: messagesLimit,
    });
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
  const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
  if (distanceToBottom <= 120) {
    void loadNextMessages();
  }
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
  } finally {
    saving.value = false;
  }
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
  } finally {
    saving.value = false;
  }
}

async function doTransition() {
  if (!item.value || !transitionStatus.value) return;
  saving.value = true;
  try {
    await transitionInquiryStatus(item.value.id, {
      toStatus: transitionStatus.value,
      reason: transitionReason.value,
      operatorType: 'human',
    });
    showTransition.value = false;
    transitionReason.value = '';
    showSuccess(`状态已变更为 ${transitionStatus.value}`);
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

function openTransition(status?: string) {
  transitionStatus.value = status ?? allowedTransitionStatuses.value[0] ?? '';
  showTransition.value = true;
}

async function doMoveMessage() {
  if (!moveMessageId.value || !moveTargetId.value) return;
  saving.value = true;
  try {
    await moveInquiryMessage(moveMessageId.value, {
      targetInquiryCaseId: moveTargetId.value,
      reason: 'Manual correction',
    });
    showMoveDialog.value = false;
    moveTargetId.value = '';
    showSuccess('邮件已移动');
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

async function doLinkEmail() {
  if (!item.value || !linkEmailId.value) return;
  saving.value = true;
  try {
    await linkMessageToInquiry(item.value.id, {
      mode: 'link_existing_email',
      emailMessageId: linkEmailId.value,
    });
    showLinkDialog.value = false;
    linkEmailId.value = '';
    showSuccess('邮件已关联');
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

async function doGenerateDraft() {
  if (!item.value) return;
  if (item.value.status === 'ready_for_quote' && !draftCommercialTerms.value.trim()) return;
  saving.value = true;
  try {
    await createReplyDraft(item.value.id, {
      targetStatus: item.value.status,
      commercialTerms: draftCommercialTerms.value.trim() || undefined,
    });
    showDraftDialog.value = false;
    draftCommercialTerms.value = '';
    showSuccess('回复草稿已生成，请前往 AI 记录审核');
    await load();
  } catch (err) {
    error.value = (err as any)?.response?.data?.message || (err instanceof Error ? err.message : String(err));
  } finally {
    saving.value = false;
  }
}

function showSuccess(msg: string) {
  successMsg.value = msg;
  setTimeout(() => { successMsg.value = ''; }, 3000);
}

function mergeMessages(current: any[], incoming: any[]) {
  const seen = new Set(current.map((message) => message.emailMessageId));
  return [...current, ...incoming.filter((message) => !seen.has(message.emailMessageId))];
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  return [];
}

function timestampOf(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function classificationTone(classification: string | null | undefined) {
  if (classification === 'valid_inquiry') return 'success';
  if (classification === 'invalid' || classification === 'unrelated_product' || classification === 'commercial') {
    return 'danger';
  }
  return 'muted';
}

function riskTone(riskLevel: string | null | undefined) {
  if (riskLevel === 'high') return 'danger';
  if (riskLevel === 'medium') return 'warning';
  if (riskLevel === 'low') return 'success';
  return 'muted';
}

onMounted(load);
</script>

<template>
  <section class="space-y-4">
    <RouterLink :to="WEB_ROUTES.inquiries">
      <Button variant="ghost" size="sm">
        <ArrowLeft class="h-4 w-4" /> 返回询盘列表
      </Button>
    </RouterLink>

    <PageHeader title="询盘详情" :description="item?.businessSubject || item?.subject || ''" :loading="loading"
      @refresh="load" />

    <!-- Success / Error -->
    <Card v-if="successMsg" class="border-green-200 bg-green-50 p-4 text-green-700">
      {{ successMsg }}
    </Card>
    <Card v-if="error" class="border-red-200 bg-red-50 p-4 text-red-700">{{ error }}</Card>

    <div v-if="item" class="grid gap-4 xl:grid-cols-[360px_1fr]">
      <!-- Sidebar -->
      <Card class="p-4">
        <div class="space-y-4">
          <div>
            <div class="text-sm text-muted-foreground">当前状态</div>
            <div class="mt-2 flex items-center gap-2">
              <StatusPill :status="item.status" />
              <Button size="sm" variant="outline" :disabled="allowedTransitionStatuses.length === 0"
                @click="openTransition()">
                流转
              </Button>
            </div>
          </div>

          <div>
            <div class="text-sm text-muted-foreground">业务主题</div>
            <div class="mt-1 flex items-center gap-2">
              <span v-if="!editingSubject" class="font-medium">{{ item.businessSubject || '(未设置)' }}</span>
              <input v-else v-model="subjectDraft" class="flex-1 rounded border px-2 py-1 text-sm"
                @keyup.enter="saveSubject" />
              <Button v-if="!editingSubject" size="sm" variant="ghost" style="background-color: #bbf7d0;"
                @click="subjectDraft = item.businessSubject || ''; editingSubject = true">
                编辑
              </Button>
              <Button v-else size="sm" variant="default" :disabled="saving" @click="saveSubject">
                保存
              </Button>
            </div>
            <div class="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Lock v-if="item.businessSubjectLocked" class="h-3 w-3" />
              <Unlock v-else class="h-3 w-3" />
              <span>{{ item.businessSubjectLocked ? '已锁定' : '未锁定' }}</span>
              <Button size="sm" variant="ghost" @click="toggleLock">
                {{ item.businessSubjectLocked ? '解锁' : '锁定' }}
              </Button>
            </div>
          </div>

          <div>
            <div class="text-sm text-muted-foreground">客户</div>
            <div class="mt-1 font-medium">{{ item.customer?.name || item.customer?.email }}</div>
            <div class="text-sm text-muted-foreground">{{ item.customer?.email }}</div>
          </div>

          <div v-if="item.organization">
            <div class="text-sm text-muted-foreground">组织</div>
            <div class="mt-1">{{ item.organization.name }}</div>
          </div>

          <div>
            <div class="text-sm text-muted-foreground">最新邮件</div>
            <div class="mt-1">{{ formatDateTime(item.latestMessageAt) }}</div>
          </div>

          <div class="flex flex-wrap gap-2">
            <Badge tone="muted">邮件 {{ item.counts?.inquiryMessages ?? 0 }}</Badge>
            <Badge tone="muted">AI {{ item.counts?.aiDecisions ?? 0 }}</Badge>
            <Badge tone="muted">快照 {{ item.counts?.contextSnapshots ?? 0 }}</Badge>
          </div>

          <div class="flex flex-col gap-2">
            <Button
              v-if="['need_clarification', 'need_engineer_review', 'ready_for_quote'].includes(item.status)"
              size="sm"
              @click="showDraftDialog = true"
            >
              <MessageSquarePlus class="h-4 w-4" /> 生成回复草稿
            </Button>
            <Button size="sm" variant="outline" @click="showLinkDialog = true">
              <ExternalLink class="h-4 w-4" /> 关联邮件
            </Button>
          </div>
        </div>
      </Card>

      <!-- Main -->
      <div class="space-y-4">
        <!-- Tabs -->
        <div class="flex gap-2 border-b">
          <button class="px-3 py-2 text-sm font-medium"
            :class="activeTab === 'messages' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'"
            @click="activeTab = 'messages'">邮件时间线</button>
          <button class="px-3 py-2 text-sm font-medium"
            :class="activeTab === 'thread' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'"
            @click="activeTab = 'thread'">聚合视图</button>
          <button class="px-3 py-2 text-sm font-medium"
            :class="activeTab === 'context' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'"
            @click="activeTab = 'context'">上下文</button>
          <button class="px-3 py-2 text-sm font-medium"
            :class="activeTab === 'events' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'"
            @click="activeTab = 'events'">邮件事件 {{ workflowTotal }}</button>
        </div>

        <!-- Messages Tab -->
        <div v-if="activeTab === 'messages'"
          class="max-h-[720px] space-y-3 overflow-y-auto pr-1 border-b border-gray-200"
          @scroll.passive="handleMessagesScroll">
          <div v-for="msg in messages" :key="msg.emailMessageId" class="rounded-lg border p-3">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2">
                <Badge :tone="msg.direction === 'inbound' ? 'default' : 'warning'">
                  {{ msg.direction === 'inbound' ? '客户' : '我方' }}
                </Badge>
                <span class="font-medium">{{ msg.subject || '(无主题)' }}</span>
              </div>
              <div class="flex items-center gap-1">
                <Badge v-if="msg.source !== 'imap'" tone="muted" size="sm">{{ email_source['system_detected'] }}</Badge>
                <Button size="sm" variant="ghost" @click="moveMessageId = msg.emailMessageId; showMoveDialog = true">
                  <Move class="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div class="mt-1 text-xs text-muted-foreground">
              {{ msg.fromName || msg.fromEmail }} — {{ formatDateTime(msg.receivedAt) }}
            </div>
            <div v-if="msg.bodyTextPreview" class="mt-1 text-sm line-clamp-2">
              {{ msg.bodyTextPreview }}
            </div>
          </div>
          <div v-if="messages.length === 0" class="py-8 text-center text-sm text-muted-foreground">
            暂无关联邮件
          </div>
          <div v-if="messagesLoadingMore" class="py-3 text-center text-xs text-muted-foreground">
            正在加载更多关联邮件...
          </div>
          <div v-else-if="messages.length > 0 && !hasMoreMessages"
            class="py-3 text-center text-xs text-muted-foreground">
            已加载全部关联邮件
          </div>
        </div>

        <!-- Workflow Events Tab -->
        <div v-if="activeTab === 'events'" class="max-h-[720px] overflow-y-auto border-b border-border">
          <div v-for="decision in workflowDecisions" :key="decision.id"
            class="border-b border-border px-4 py-4 last:border-b-0">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium">{{ workflowEventLabel(decision.eventType) }}</span>
                  <Badge :tone="workflowStatusTone(decision.executionStatus)">
                    {{ decision.executionStatus }}
                  </Badge>
                  <Badge tone="muted">{{ decision.decisionSource === 'ai' ? 'AI 判断' : '系统规则' }}</Badge>
                </div>
                <div class="mt-1 truncate text-xs text-muted-foreground">
                  {{ decision.emailMessage?.subject || '(无主题)' }} · {{ formatDateTime(decision.emailMessage?.receivedAt) }}
                </div>
              </div>
              <div class="text-right text-xs text-muted-foreground">
                <div>{{ decision.confidence == null ? '-' : `${Math.round(decision.confidence * 100)}%` }}</div>
                <div>{{ decision.riskLevel || '-' }}</div>
              </div>
            </div>
            <p class="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
              {{ decision.reason || decision.executionReason || '暂无判断说明' }}
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span class="text-muted-foreground">状态建议</span>
              <span class="font-medium">
                {{ decision.executionFromStatus || item?.status || '-' }}
                →
                {{ decision.suggestedStatus || '不变' }}
              </span>
              <Badge v-if="decision.responseExpected" tone="warning">等待客户回复</Badge>
              <Badge v-if="decision.commercialBoundaryDetected" tone="danger">商业边界</Badge>
              <Badge v-if="decision.humanReviewRequired" tone="muted">建议人工复核</Badge>
            </div>
            <div v-if="['pending', 'dry_run', 'historical_backfill', 'rejected', 'conflict'].includes(decision.executionStatus)"
              class="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="outline" @click="openWorkflowReview(decision.id, 'reject')">拒绝</Button>
              <Button v-if="decision.suggestedStatus" size="sm" @click="openWorkflowReview(decision.id, 'apply')">
                应用建议
              </Button>
            </div>
          </div>
          <div v-if="workflowDecisions.length === 0" class="py-12 text-center text-sm text-muted-foreground">
            暂无邮件业务事件
          </div>
        </div>

        <!-- Thread Tab -->
        <div v-if="activeTab === 'thread' && threadData">
          <Card class="p-4">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <BrainCircuit class="h-4 w-4 text-primary" />
                <h2 class="font-semibold">最新流程决策</h2>
                <Badge v-if="latestProcessDecision" :tone="latestProcessDecision.kind === 'inbound' ? 'default' : 'warning'">
                  {{ latestProcessDecision.kind === 'inbound' ? '客户入站分析' : '我方出站事件' }}
                </Badge>
              </div>
              <span v-if="latestProcessCreatedAt" class="text-xs text-muted-foreground">
                {{ formatDateTime(latestProcessCreatedAt) }}
              </span>
            </div>

            <div v-if="latestProcessDecision" class="mt-4 space-y-4">
              <div class="grid gap-3 md:grid-cols-4">
                <div class="rounded-md border border-border bg-muted/30 p-3">
                  <div class="text-xs text-muted-foreground">
                    {{ latestProcessDecision.kind === 'inbound' ? '询盘分类' : '出站事件' }}
                  </div>
                  <Badge v-if="latestProcessDecision.kind === 'inbound'" class="mt-2"
                    :tone="classificationTone(latestProcessDecision.value.classification)">
                    {{ latestProcessDecision.value.classification || '-' }}
                  </Badge>
                  <div v-else class="mt-2 text-sm font-medium">
                    {{ workflowEventLabel(latestProcessDecision.value.eventType) }}
                  </div>
                </div>
                <div class="rounded-md border border-border bg-muted/30 p-3">
                  <div class="text-xs text-muted-foreground">执行结果</div>
                  <Badge class="mt-2" :tone="workflowStatusTone(latestProcessExecutionStatus)">
                    {{ latestProcessExecutionStatus }}
                  </Badge>
                </div>
                <div class="rounded-md border border-border bg-muted/30 p-3">
                  <div class="text-xs text-muted-foreground">建议状态</div>
                  <div class="mt-2 text-sm font-medium">
                    {{ latestProcessSuggestedStatus ? getInquiryStatusLabel(latestProcessSuggestedStatus) : '保持不变' }}
                  </div>
                </div>
                <div class="rounded-md border border-border bg-muted/30 p-3">
                  <div class="text-xs text-muted-foreground">置信度</div>
                  <div class="mt-2 flex items-center gap-2 text-sm font-medium">
                    <span>{{ latestProcessConfidencePercent == null ? '-' : `${latestProcessConfidencePercent}%` }}</span>
                    <Badge :tone="riskTone(latestProcessRiskLevel)">{{ latestProcessRiskLevel || '-' }}</Badge>
                  </div>
                </div>
              </div>

              <div class="grid gap-3 md:grid-cols-2">
                <div class="rounded-md border border-border p-3">
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 class="h-4 w-4 text-emerald-600" />
                    判断原因
                  </div>
                  <p class="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {{ latestProcessReason || '暂无原因' }}
                  </p>
                </div>
                <div class="rounded-md border border-border p-3">
                  <!-- <div class="mt-2"><JsonBlock :value="threadData.latestAiDecision || {}" /></div> -->
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <ShieldAlert class="h-4 w-4 text-amber-600" />
                    状态影响
                  </div>
                  <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <StatusPill v-if="latestProcessFromStatus" :status="latestProcessFromStatus" />
                    <span class="text-muted-foreground">→</span>
                    <StatusPill v-if="latestProcessToStatus" :status="latestProcessToStatus" />
                    <span v-else class="text-muted-foreground">状态不变</span>
                  </div>
                  <p v-if="latestProcessDecision.kind === 'inbound' && latestProcessDecision.value.nextAction"
                    class="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                    {{ latestProcessDecision.value.nextAction }}
                  </p>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <Badge :tone="latestProcessDecision.value.humanReviewRequired ? 'warning' : 'muted'">
                  {{ latestProcessDecision.value.humanReviewRequired ? '建议人工复核' : '无需额外复核' }}
                </Badge>
                <Badge v-if="latestProcessDecision.kind === 'inbound'"
                  :tone="latestProcessDecision.value.quoteBoundaryDetected ? 'warning' : 'muted'">
                  {{ latestProcessDecision.value.quoteBoundaryDetected ? '检测到报价边界' : '未检测到报价边界' }}
                </Badge>
                <Badge v-else :tone="latestProcessDecision.value.commercialBoundaryDetected ? 'warning' : 'muted'">
                  {{ latestProcessDecision.value.commercialBoundaryDetected ? '涉及商业边界' : '普通业务事件' }}
                </Badge>
                <Badge v-if="latestProcessDecision.kind === 'outbound' && latestProcessDecision.value.responseExpected"
                  tone="warning">
                  等待客户回复
                </Badge>
              </div>

              <div v-if="latestProcessDecision.kind === 'inbound'">
                <div class="text-sm font-medium">缺失字段</div>
                <div v-if="latestAiMissingFields.length" class="mt-2 flex flex-wrap gap-2">
                  <Badge v-for="field in latestAiMissingFields" :key="field" tone="warning">{{ field }}</Badge>
                </div>
                <div v-else class="mt-2 text-sm text-muted-foreground">无明显缺失字段</div>
              </div>
            </div>
            <div v-else
              class="mt-4 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              暂无 AI 决策
            </div>
          </Card>
          <Card class="mt-4 p-4">
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-semibold">人工状态校正</h2>
              <StatusPill v-if="item" :status="item.status" />
            </div>
            <div v-if="allowedTransitionStatuses.length" class="mt-2 flex flex-wrap gap-2">
              <Button v-for="s in allowedTransitionStatuses" :key="s" size="sm" variant="outline"
                @click="openTransition(s)">
                {{ getInquiryStatusLabel(s) }}
              </Button>
            </div>
            <div v-else class="mt-2 text-sm text-muted-foreground">无可用流转</div>
          </Card>
          <Card class="mt-4 p-4">
            <h2 class="font-semibold">邮件 ({{ threadData.messages?.length || 0 }})</h2>
            <div v-for="m in threadData.messages" :key="m.emailMessageId" class="mt-2 border-t pt-2">
              <div class="flex items-center gap-2">
                <Badge :tone="m.direction === 'inbound' ? 'default' : 'warning'" size="sm">
                  {{ m.direction }}
                </Badge>
                <span class="text-sm font-medium">{{ m.subject }}</span>
              </div>
              <div class="text-xs text-muted-foreground">{{ m.fromEmail }} — {{ formatDateTime(m.receivedAt) }}</div>
            </div>
          </Card>
        </div>

        <!-- Context Tab -->
        <div v-if="activeTab === 'context'">
          <Card class="p-4">
            <h2 class="font-semibold">最新快照</h2>
            <div class="mt-3">
              <JsonBlock :value="fullSnapshot?.messages || threadData?.latestContextSnapshot || {}" />
            </div>
          </Card>
          <Card class="mt-4 p-4">
            <h2 class="font-semibold">最新草稿</h2>
            <div class="mt-3">
              <JsonBlock :value="threadData?.latestDraft || {}" />
            </div>
          </Card>
        </div>
      </div>
    </div>

    <!-- Transition Dialog -->
    <Teleport to="body">
      <div v-if="showTransition" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="showTransition = false">
        <Card class="w-full max-w-md p-4">
          <h2 class="font-semibold">状态流转</h2>
          <div class="mt-3 space-y-3">
            <div>
              <label class="text-sm text-muted-foreground">目标状态</label>
              <select v-model="transitionStatus" class="mt-1 w-full rounded border px-2 py-1"
                :disabled="allowedTransitionStatuses.length === 0">
                <option value="" disabled>请选择目标状态</option>
                <option v-for="status in allowedTransitionStatuses" :key="status" :value="status">
                  {{ getInquiryStatusLabel(status) }} ({{ status }})
                </option>
              </select>
            </div>
            <div>
              <label class="text-sm text-muted-foreground">原因</label>
              <textarea v-model="transitionReason" class="mt-1 w-full rounded border px-2 py-1 text-sm" rows="2" />
            </div>
            <div class="flex justify-end gap-2">
              <Button variant="ghost" @click="showTransition = false">取消</Button>
              <Button :disabled="!transitionStatus || saving" @click="doTransition">
                {{ saving ? '处理中...' : '确认流转' }}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </Teleport>

    <!-- Workflow Decision Review Dialog -->
    <Teleport to="body">
      <div v-if="showWorkflowReview" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="showWorkflowReview = false">
        <Card class="w-full max-w-md p-4">
          <h2 class="font-semibold">
            {{ workflowReviewAction === 'apply' ? '应用邮件事件建议' : '拒绝邮件事件建议' }}
          </h2>
          <p class="mt-1 text-sm text-muted-foreground">
            应用操作仍会经过后端状态机校验，并使用条件更新避免覆盖其他操作。
          </p>
          <div class="mt-3">
            <label class="text-sm text-muted-foreground">
              原因{{ workflowReviewAction === 'reject' ? '（必填）' : '（可选）' }}
            </label>
            <textarea v-model="workflowReviewReason" rows="3"
              class="mt-1 w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <Button variant="ghost" @click="showWorkflowReview = false">取消</Button>
            <Button
              :disabled="saving || (workflowReviewAction === 'reject' && !workflowReviewReason.trim())"
              @click="submitWorkflowReview"
            >
              {{ saving ? '处理中...' : '确认' }}
            </Button>
          </div>
        </Card>
      </div>
    </Teleport>

    <!-- Move Message Dialog -->
    <Teleport to="body">
      <div v-if="showMoveDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="showMoveDialog = false">
        <Card class="w-full max-w-md p-4">
          <h2 class="font-semibold">移动邮件到其他询盘</h2>
          <div class="mt-3 space-y-3">
            <div>
              <label class="text-sm text-muted-foreground">目标询盘 ID</label>
              <input v-model="moveTargetId" class="mt-1 w-full rounded border px-2 py-1" placeholder="如: inquiry_xxx" />
            </div>
            <div class="flex justify-end gap-2">
              <Button variant="ghost" @click="showMoveDialog = false">取消</Button>
              <Button :disabled="!moveTargetId || saving" @click="doMoveMessage">
                {{ saving ? '处理中...' : '确认移动' }}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </Teleport>

    <!-- Link Email Dialog -->
    <Teleport to="body">
      <div v-if="showLinkDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="showLinkDialog = false">
        <Card class="w-full max-w-md p-4">
          <h2 class="font-semibold">关联已有邮件</h2>
          <div class="mt-3 space-y-3">
            <div>
              <label class="text-sm text-muted-foreground">邮件 ID</label>
              <input v-model="linkEmailId" class="mt-1 w-full rounded border px-2 py-1" placeholder="如: email_xxx" />
            </div>
            <div class="flex justify-end gap-2">
              <Button variant="ghost" @click="showLinkDialog = false">取消</Button>
              <Button :disabled="!linkEmailId || saving" @click="doLinkEmail">
                {{ saving ? '处理中...' : '确认关联' }}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </Teleport>

    <!-- Generate Draft Dialog -->
    <Teleport to="body">
      <div v-if="showDraftDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="showDraftDialog = false">
        <Card class="w-full max-w-lg p-4">
          <h2 class="font-semibold">生成回复草稿</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            草稿只会进入人工审核，不会自动发送。
          </p>
          <div class="mt-3">
            <label class="text-sm text-muted-foreground">
              {{ item?.status === 'ready_for_quote' ? '确认后的商业条件（必填）' : '人工补充说明（可选）' }}
            </label>
            <textarea v-model="draftCommercialTerms" rows="5"
              class="mt-1 w-full rounded border px-3 py-2 text-sm"
              placeholder="价格、数量阶梯、交期、付款或合同条件必须由人工确认后填写" />
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <Button variant="ghost" @click="showDraftDialog = false">取消</Button>
            <Button
              :disabled="saving || (item?.status === 'ready_for_quote' && !draftCommercialTerms.trim())"
              @click="doGenerateDraft"
            >
              {{ saving ? '生成中...' : '生成草稿' }}
            </Button>
          </div>
        </Card>
      </div>
    </Teleport>
  </section>
</template>
