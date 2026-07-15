<script setup lang="ts">
import type {
  EmailAnalysisDecisionListItem,
  EmailAttachmentListItem,
  MailRuntimeInfo,
  ReplyDraftListItem,
} from '@email-inquiry/shared';
import { Check, RefreshCcw, RotateCcw, Save, Send, X } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';

import {
  approveReplyDraft,
  fetchEmailAnalysisDecisions,
  fetchInquiryThread,
  fetchMailRuntime,
  fetchReplyDraft,
  fetchReplyDrafts,
  regenerateReplyDraft,
  rejectReplyDraft,
  sendReplyDraft,
  updateReplyDraft,
} from '@/api/backend';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import EmptyState from '@/components/workbench/EmptyState.vue';
import PageHeader from '@/components/workbench/PageHeader.vue';
import { formatDateTime, truncate } from '@/lib/format';

const loading = ref(false);
const actionLoading = ref(false);
const error = ref('');
const notice = ref('');
const decisions = ref<EmailAnalysisDecisionListItem[]>([]);
const drafts = ref<ReplyDraftListItem[]>([]);
const selected = ref<ReplyDraftListItem | null>(null);
const runtime = ref<MailRuntimeInfo | null>(null);
const decisionTotal = ref(0);
const draftTotal = ref(0);
const decisionPage = ref(1);
const draftPage = ref(1);
const pageLimit = 30;
const decisionsLoadingMore = ref(false);
const draftsLoadingMore = ref(false);
const subject = ref('');
const bodyText = ref('');
const rejectionReason = ref('');
const commercialTerms = ref('');
const candidateAttachments = ref<EmailAttachmentListItem[]>([]);
const selectedAttachmentIds = ref<string[]>([]);

const hasMoreDecisions = computed(() => decisions.value.length < decisionTotal.value);
const hasMoreDrafts = computed(() => drafts.value.length < draftTotal.value);
const isProduction = computed(() => runtime.value?.mailOperationMode === 'production');
const canEdit = computed(() => Boolean(selected.value && ['pending_review', 'rejected'].includes(selected.value.status)));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [decisionResult, draftResult, runtimeResult] = await Promise.all([
      fetchEmailAnalysisDecisions({ page: 1, limit: pageLimit }),
      fetchReplyDrafts({ page: 1, limit: pageLimit }),
      fetchMailRuntime(),
    ]);
    decisionPage.value = 1;
    draftPage.value = 1;
    decisions.value = decisionResult.data;
    drafts.value = draftResult.data;
    decisionTotal.value = decisionResult.total;
    draftTotal.value = draftResult.total;
    runtime.value = runtimeResult;
    if (selected.value) await selectDraft(selected.value.id);
  } catch (err) {
    error.value = readError(err);
  } finally {
    loading.value = false;
  }
}

async function selectDraft(id: string) {
  actionLoading.value = true;
  error.value = '';
  try {
    selected.value = await fetchReplyDraft(id);
    subject.value = selected.value.subject || '';
    bodyText.value = selected.value.bodyText;
    selectedAttachmentIds.value = (selected.value.attachments || []).map((item) => item.id);
    const thread = await fetchInquiryThread(selected.value.inquiryCaseId);
    const messages = Array.isArray(thread?.messages) ? thread.messages : [];
    candidateAttachments.value = dedupeAttachments(
      messages.flatMap((message: any) => Array.isArray(message.attachments) ? message.attachments : []),
    );
  } catch (err) {
    error.value = readError(err);
  } finally {
    actionLoading.value = false;
  }
}

async function saveDraft() {
  if (!selected.value) return;
  await runAction(async () => {
    await updateReplyDraft(selected.value!.id, {
      version: selected.value!.version,
      subject: subject.value,
      bodyText: bodyText.value,
      attachmentIds: selectedAttachmentIds.value,
    });
    await selectDraft(selected.value!.id);
  }, '草稿已保存');
}

async function approveDraft() {
  if (!selected.value) return;
  await runAction(async () => {
    await approveReplyDraft(selected.value!.id);
    await selectDraft(selected.value!.id);
  }, '草稿已批准');
}

async function rejectDraft() {
  if (!selected.value || !rejectionReason.value.trim()) return;
  await runAction(async () => {
    await rejectReplyDraft(selected.value!.id, rejectionReason.value);
    rejectionReason.value = '';
    await selectDraft(selected.value!.id);
  }, '草稿已拒绝');
}

async function regenerateDraft() {
  if (!selected.value) return;
  await runAction(async () => {
    const generated = await regenerateReplyDraft(selected.value!.id, commercialTerms.value || undefined);
    commercialTerms.value = '';
    await load();
    await selectDraft(generated.id);
  }, '已生成新版本，旧版本已过期');
}

async function sendDraft() {
  if (!selected.value) return;
  const prompt = isProduction.value
    ? '当前为生产模式，将真实发送给客户。确认继续？'
    : '当前为调试模式，将创建模拟发信记录。确认继续？';
  if (!window.confirm(prompt)) return;
  await runAction(async () => {
    await sendReplyDraft(selected.value!.id);
    await selectDraft(selected.value!.id);
    await load();
  }, isProduction.value ? '邮件已提交 SMTP' : '模拟发送完成');
}

async function runAction(action: () => Promise<void>, successMessage: string) {
  actionLoading.value = true;
  error.value = '';
  notice.value = '';
  try {
    await action();
    notice.value = successMessage;
  } catch (err) {
    error.value = readError(err);
  } finally {
    actionLoading.value = false;
  }
}

async function loadNextDecisions() {
  if (loading.value || decisionsLoadingMore.value || !hasMoreDecisions.value) return;
  decisionsLoadingMore.value = true;
  try {
    const result = await fetchEmailAnalysisDecisions({ page: ++decisionPage.value, limit: pageLimit });
    decisions.value = mergeById(decisions.value, result.data);
    decisionTotal.value = result.total;
  } catch (err) {
    decisionPage.value -= 1;
    error.value = readError(err);
  } finally {
    decisionsLoadingMore.value = false;
  }
}

async function loadNextDrafts() {
  if (loading.value || draftsLoadingMore.value || !hasMoreDrafts.value) return;
  draftsLoadingMore.value = true;
  try {
    const result = await fetchReplyDrafts({ page: ++draftPage.value, limit: pageLimit });
    drafts.value = mergeById(drafts.value, result.data);
    draftTotal.value = result.total;
  } catch (err) {
    draftPage.value -= 1;
    error.value = readError(err);
  } finally {
    draftsLoadingMore.value = false;
  }
}

function handleScroll(event: Event, loadNext: () => Promise<void>) {
  const target = event.currentTarget as HTMLElement;
  if (target.scrollHeight - target.scrollTop - target.clientHeight <= 120) void loadNext();
}

function confidenceText(value?: number | null) {
  return value === null || value === undefined ? '-' : `${Math.round(value * 100)}%`;
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

function dedupeAttachments(items: EmailAttachmentListItem[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function readError(err: unknown) {
  const responseMessage = (err as any)?.response?.data?.message;
  return responseMessage || (err instanceof Error ? err.message : String(err));
}

onMounted(load);
</script>

<template>
  <section>
    <PageHeader title="AI 决策与回复草稿" description="审核 AI 建议，编辑草稿并执行模拟或真实发送。" :loading="loading" @refresh="load">
      <template #action><RefreshCcw class="h-4 w-4" :class="{ 'animate-spin': loading }" />刷新</template>
    </PageHeader>

    <div class="mb-4 flex flex-wrap items-center gap-2">
      <Badge :tone="isProduction ? 'danger' : 'warning'">{{ isProduction ? 'PRODUCTION 真实发信' : 'DEBUG 模拟发信' }}</Badge>
      <Badge tone="muted">IMAP {{ runtime?.imapPollEnabled ? 'ON' : 'OFF' }}</Badge>
      <span class="text-xs text-muted-foreground">运行模式由后端环境变量决定，页面不可切换。</span>
    </div>
    <Card v-if="error" class="mb-4 border-red-200 bg-red-50 p-4 text-red-700">{{ error }}</Card>
    <Card v-if="notice" class="mb-4 border-emerald-200 bg-emerald-50 p-4 text-emerald-700">{{ notice }}</Card>

    <div class="grid gap-4 xl:grid-cols-2">
      <Card class="overflow-hidden">
        <div class="border-b border-border px-4 py-3"><h2 class="font-semibold">AI 决策记录</h2><p class="text-sm text-muted-foreground">共 {{ decisionTotal }} 条</p></div>
        <div class="max-h-[560px] divide-y divide-border overflow-y-auto" @scroll.passive="handleScroll($event, loadNextDecisions)">
          <article v-for="item in decisions" :key="item.id" class="p-4">
            <div class="flex items-center justify-between gap-2"><div class="flex gap-2"><Badge :tone="item.success ? 'success' : 'danger'">{{ item.messageClassification || 'failed' }}</Badge><Badge tone="warning">{{ item.suggestedState ? `${item.suggestedState.businessStage}/${item.suggestedState.actionOwner}/${item.suggestedState.lifecycleStatus}` : '-' }}</Badge></div><span class="text-xs text-muted-foreground">{{ confidenceText(item.confidence) }}</span></div>
            <div class="mt-2 text-sm">{{ item.emailMessage?.subject || item.inquiryCase?.businessSubject || '(no subject)' }}</div>
            <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ item.reason || item.errorMessage || '-' }}</p>
          </article>
          <EmptyState v-if="!loading && decisions.length === 0">暂无 AI 决策</EmptyState>
        </div>
      </Card>

      <Card class="overflow-hidden">
        <div class="border-b border-border px-4 py-3"><h2 class="font-semibold">回复草稿</h2><p class="text-sm text-muted-foreground">共 {{ draftTotal }} 条，点击进入审核</p></div>
        <div class="max-h-[560px] divide-y divide-border overflow-y-auto" @scroll.passive="handleScroll($event, loadNextDrafts)">
          <button v-for="item in drafts" :key="item.id" class="block w-full p-4 text-left hover:bg-muted/50" :class="{ 'bg-muted': selected?.id === item.id }" @click="selectDraft(item.id)">
            <div class="flex items-center justify-between gap-2"><div class="flex gap-2"><Badge tone="muted">{{ item.status }}</Badge><Badge tone="muted">v{{ item.version }}</Badge></div><span class="text-xs text-muted-foreground">{{ formatDateTime(item.createdAt) }}</span></div>
            <div class="mt-2 text-sm font-medium">{{ item.subject || '(no subject)' }}</div>
            <p class="mt-2 text-sm text-muted-foreground">{{ truncate(item.bodyText, 180) }}</p>
          </button>
          <EmptyState v-if="!loading && drafts.length === 0">暂无回复草稿</EmptyState>
        </div>
      </Card>
    </div>

    <Card v-if="selected" class="mt-4 overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div><h2 class="font-semibold">草稿审核</h2><p class="text-xs text-muted-foreground">{{ selected.inquiryCase?.customer?.email }} · {{ selected.draftType }} · {{ selected.promptVersion }}</p></div>
        <div class="flex gap-2"><Badge :tone="selected.status === 'approved' ? 'success' : selected.status.includes('failed') || selected.status === 'send_unknown' ? 'danger' : 'muted'">{{ selected.status }}</Badge><Badge v-if="selected.requiresCommercialReview" tone="warning">需商业审核</Badge></div>
      </div>
      <div class="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div class="space-y-3">
          <label class="block text-sm font-medium">主题<input v-model="subject" :disabled="!canEdit" class="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
          <label class="block text-sm font-medium">正文<textarea v-model="bodyText" :disabled="!canEdit" rows="14" class="mt-1 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6" /></label>
          <div v-if="candidateAttachments.length" class="space-y-2"><div class="text-sm font-medium">出站附件</div><label v-for="attachment in candidateAttachments" :key="attachment.id" class="flex items-center gap-2 text-sm"><input v-model="selectedAttachmentIds" type="checkbox" :value="attachment.id" :disabled="!canEdit" />{{ attachment.originalFileName || attachment.safeFileName }} <span class="text-xs text-muted-foreground">{{ attachment.mimeType }}</span></label></div>
          <div class="flex flex-wrap gap-2"><Button :disabled="actionLoading || !canEdit" @click="saveDraft"><Save class="h-4 w-4" />保存</Button><Button variant="outline" :disabled="actionLoading || selected.status !== 'pending_review'" @click="approveDraft"><Check class="h-4 w-4" />批准</Button><Button variant="outline" :disabled="actionLoading || selected.status !== 'approved'" @click="sendDraft"><Send class="h-4 w-4" />{{ isProduction ? '真实发送' : '模拟发送' }}</Button></div>
        </div>
        <aside class="space-y-4 border-l border-border pl-5">
          <div><div class="text-sm font-medium">拒绝草稿</div><textarea v-model="rejectionReason" rows="3" placeholder="填写拒绝原因" class="mt-2 w-full rounded-md border border-input px-3 py-2 text-sm" /><Button class="mt-2" variant="outline" :disabled="actionLoading || !rejectionReason.trim()" @click="rejectDraft"><X class="h-4 w-4" />拒绝</Button></div>
          <div><div class="text-sm font-medium">重新生成</div><textarea v-model="commercialTerms" rows="4" placeholder="报价草稿必须填写确认后的价格、交期等商业条件" class="mt-2 w-full rounded-md border border-input px-3 py-2 text-sm" /><Button class="mt-2" variant="outline" :disabled="actionLoading" @click="regenerateDraft"><RotateCcw class="h-4 w-4" />生成新版本</Button></div>
          <div v-if="selected.warnings?.length"><div class="text-sm font-medium">AI 警告</div><ul class="mt-2 space-y-1 text-sm text-amber-700"><li v-for="warning in selected.warnings" :key="warning">{{ warning }}</li></ul></div>
          <div v-if="selected.lastSendError" class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{{ selected.lastSendError }}</div>
          <div v-if="selected.sendAttempts?.length"><div class="text-sm font-medium">发送审计</div><div v-for="attempt in selected.sendAttempts" :key="attempt.id" class="mt-2 border-l-2 border-border pl-3 text-xs"><div>{{ attempt.operationMode }} / {{ attempt.provider }} / {{ attempt.status }}</div><div class="text-muted-foreground">{{ formatDateTime(attempt.startedAt) }}</div></div></div>
        </aside>
      </div>
    </Card>
  </section>
</template>
