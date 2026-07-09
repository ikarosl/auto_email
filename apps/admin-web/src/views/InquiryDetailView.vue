<script setup lang="ts">
import type { InquiryListItem } from '@email-inquiry/shared';
import {
  ArrowLeft,
  ExternalLink,
  Lock,
  MessageSquare,
  Move,
  RefreshCcw,
  Unlock,
} from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { WEB_ROUTES } from '@email-inquiry/shared';

import {
  fetchInquiry,
  fetchInquiryMessages,
  fetchInquiryThread,
  linkMessageToInquiry,
  moveInquiryMessage,
  transitionInquiryStatus,
  updateInquiry,
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
const activeTab = ref<'messages' | 'thread' | 'context'>('messages');

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

const hasMoreMessages = computed(() => messages.value.length < messagesTotal.value);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const inquiryId = String(route.params.id);
    messagesPage.value = 1;
    const [inquiryResult, messagesResult, threadResult] = await Promise.all([
      fetchInquiry(inquiryId),
      fetchInquiryMessages(inquiryId, { page: messagesPage.value, limit: messagesLimit }),
      fetchInquiryThread(inquiryId),
    ]);
    item.value = inquiryResult;
    messages.value = messagesResult.data;
    messagesTotal.value = messagesResult.total;
    threadData.value = threadResult;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
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

function showSuccess(msg: string) {
  successMsg.value = msg;
  setTimeout(() => { successMsg.value = ''; }, 3000);
}

function mergeMessages(current: any[], incoming: any[]) {
  const seen = new Set(current.map((message) => message.emailMessageId));
  return [...current, ...incoming.filter((message) => !seen.has(message.emailMessageId))];
}

onMounted(load);
</script>

<template>
  <section class="space-y-4">
    <RouterLink :to="WEB_ROUTES.inquiries">
      <Button variant="ghost" size="sm"><ArrowLeft class="h-4 w-4" /> 返回询盘列表</Button>
    </RouterLink>

    <PageHeader
      title="询盘详情"
      :description="item?.businessSubject || item?.subject || ''"
      :loading="loading"
      @refresh="load"
    />

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
              <Button size="sm" variant="outline" @click="showTransition = true">流转</Button>
            </div>
          </div>

          <div>
            <div class="text-sm text-muted-foreground">业务主题</div>
            <div class="mt-1 flex items-center gap-2">
              <span v-if="!editingSubject" class="font-medium">{{ item.businessSubject || '(未设置)' }}</span>
              <input
                v-else
                v-model="subjectDraft"
                class="flex-1 rounded border px-2 py-1 text-sm"
                @keyup.enter="saveSubject"
              />
              <Button v-if="!editingSubject" size="sm" variant="ghost" @click="subjectDraft = item.businessSubject || ''; editingSubject = true">
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
          <button
            class="px-3 py-2 text-sm font-medium"
            :class="activeTab === 'messages' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'"
            @click="activeTab = 'messages'"
          >邮件时间线</button>
          <button
            class="px-3 py-2 text-sm font-medium"
            :class="activeTab === 'thread' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'"
            @click="activeTab = 'thread'"
          >聚合视图</button>
          <button
            class="px-3 py-2 text-sm font-medium"
            :class="activeTab === 'context' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'"
            @click="activeTab = 'context'"
          >上下文</button>
        </div>

        <!-- Messages Tab -->
        <div
          v-if="activeTab === 'messages'"
          class="max-h-[720px] space-y-3 overflow-y-auto pr-1 border-b border-gray-200"
          @scroll.passive="handleMessagesScroll"
        >
          <div v-for="msg in messages" :key="msg.emailMessageId" class="rounded-lg border p-3">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2">
                <Badge :tone="msg.direction === 'inbound' ? 'default' : 'warning'">
                  {{ msg.direction === 'inbound' ? '客户' : '我方' }}
                </Badge>
                <span class="font-medium">{{ msg.subject || '(无主题)' }}</span>
              </div>
              <div class="flex items-center gap-1">
                <Badge v-if="msg.source !== 'imap'" tone="muted" size="sm">{{ msg.source }}</Badge>
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
          <div
            v-else-if="messages.length > 0 && !hasMoreMessages"
            class="py-3 text-center text-xs text-muted-foreground"
          >
            已加载全部关联邮件
          </div>
        </div>

        <!-- Thread Tab -->
        <div v-if="activeTab === 'thread' && threadData">
          <Card class="p-4">
            <h2 class="font-semibold">最新 AI 决策</h2>
            <div class="mt-2"><JsonBlock :value="threadData.latestAiDecision || {}" /></div>
          </Card>
          <Card class="mt-4 p-4">
            <h2 class="font-semibold">允许的状态流转</h2>
            <div v-if="threadData.allowedTransitions?.length" class="mt-2 flex flex-wrap gap-2">
              <Button
                v-for="s in threadData.allowedTransitions"
                :key="s"
                size="sm"
                variant="outline"
                @click="transitionStatus = s; showTransition = true"
              >
                {{ s }}
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
            <div class="mt-3"><JsonBlock :value="threadData?.latestContextSnapshot || {}" /></div>
          </Card>
          <Card class="mt-4 p-4">
            <h2 class="font-semibold">最新草稿</h2>
            <div class="mt-3"><JsonBlock :value="threadData?.latestDraft || {}" /></div>
          </Card>
        </div>
      </div>
    </div>

    <!-- Transition Dialog -->
    <Teleport to="body">
      <div v-if="showTransition" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="showTransition = false">
        <Card class="w-full max-w-md p-4">
          <h2 class="font-semibold">状态流转</h2>
          <div class="mt-3 space-y-3">
            <div>
              <label class="text-sm text-muted-foreground">目标状态</label>
              <input v-model="transitionStatus" class="mt-1 w-full rounded border px-2 py-1" placeholder="如: need_clarification" />
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

    <!-- Move Message Dialog -->
    <Teleport to="body">
      <div v-if="showMoveDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="showMoveDialog = false">
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
      <div v-if="showLinkDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="showLinkDialog = false">
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
  </section>
</template>
