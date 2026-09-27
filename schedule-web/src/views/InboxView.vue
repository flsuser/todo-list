<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Delete, MagicStick, Picture, UploadFilled } from '@element-plus/icons-vue'
import AiDraftCard from '@/components/AiDraftCard.vue'
import { api } from '@/api'
import type { AiBatchSummary, AiCapability, AiDraftPayload } from '@/api/types'
import { useEventsStore } from '@/stores/events'
import { dayjs } from '@/utils/time'

const MAX_IMAGE_SIZE = 8 * 1024 * 1024
const ACCEPT_MIME = ['image/jpeg', 'image/png', 'image/webp']

interface Row {
  itemId: number
  payload: AiDraftPayload
  selected: boolean
}

const router = useRouter()
const store = useEventsStore()

const capability = ref<AiCapability | null>(null)
const text = ref('')
const files = ref<File[]>([])
const previews = ref<{ name: string; url: string }[]>([])
const parsing = ref(false)
const confirming = ref(false)
const batchId = ref('')
const rows = ref<Row[]>([])
const dragOver = ref(false)
const history = ref<AiBatchSummary[]>([])
const historyTotal = ref(0)
const fileInput = ref<HTMLInputElement | null>(null)

const maxImages = computed(() => capability.value?.maxImages ?? 5)
const visionEnabled = computed(() => Boolean(capability.value?.visionEnabled))
const aiEnabled = computed(() => capability.value?.enabled !== false)
const selectedRows = computed(() => rows.value.filter((r) => r.selected))
const allSelected = computed(
  () => rows.value.length > 0 && rows.value.every((r) => r.selected),
)
const missingTime = computed(() => selectedRows.value.filter((r) => !r.payload.startAt))

// ---------- 图片选择 ----------

function addFiles(incoming: File[]) {
  if (!visionEnabled.value) {
    ElMessage.warning('当前未开通图片识别，请只用文字描述日程')
    return
  }

  for (const file of incoming) {
    if (files.value.length >= maxImages.value) {
      ElMessage.warning(`最多上传 ${maxImages.value} 张图片`)
      break
    }
    if (!ACCEPT_MIME.includes(file.type)) {
      ElMessage.warning(`已跳过 ${file.name}：仅支持 jpg / png / webp`)
      continue
    }
    if (file.size > MAX_IMAGE_SIZE) {
      ElMessage.warning(`已跳过 ${file.name}：单张不能超过 8MB`)
      continue
    }
    files.value.push(file)
    previews.value.push({ name: file.name, url: URL.createObjectURL(file) })
  }
}

function pickFiles() {
  fileInput.value?.click()
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) addFiles([...input.files])
  // 清空 value，保证连续选择同一个文件也能触发 change
  input.value = ''
}

function removeAt(index: number) {
  URL.revokeObjectURL(previews.value[index].url)
  previews.value.splice(index, 1)
  files.value.splice(index, 1)
}

function clearImages() {
  previews.value.forEach((p) => URL.revokeObjectURL(p.url))
  previews.value = []
  files.value = []
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const dropped = [...(e.dataTransfer?.files ?? [])]
  if (dropped.length) addFiles(dropped)
}

/** 支持直接 Ctrl+V 粘贴截图 */
function onPaste(e: ClipboardEvent) {
  const picked: File[] = []
  for (const item of e.clipboardData?.items ?? []) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) picked.push(file)
    }
  }
  if (picked.length) {
    e.preventDefault()
    addFiles(picked)
  }
}

// ---------- 识别与确认 ----------

async function parse() {
  if (!text.value.trim() && !files.value.length) {
    ElMessage.warning('请先输入文字或上传图片')
    return
  }

  parsing.value = true
  try {
    const res = await api.aiParse(text.value.trim(), files.value)
    batchId.value = res.batchId
    rows.value = res.items.map((i) => ({
      itemId: i.itemId,
      payload: { ...i.payload },
      selected: true,
    }))
    ElMessage.success(`识别出 ${res.items.length} 条日程，请核对后确认`)
  } catch {
    // 未配置 Key、视觉模型缺失或超时，拦截器已给出具体原因
  } finally {
    parsing.value = false
  }
}

function toggleAll() {
  const next = !allSelected.value
  rows.value.forEach((r) => (r.selected = next))
}

function invert() {
  rows.value.forEach((r) => (r.selected = !r.selected))
}

async function confirm() {
  if (!selectedRows.value.length) {
    ElMessage.warning('请至少勾选一条草稿')
    return
  }
  if (missingTime.value.length) {
    ElMessage.warning(
      `有 ${missingTime.value.length} 条缺少开始时间（如「${missingTime.value[0].payload.title}」），请补充或取消勾选`,
    )
    return
  }

  confirming.value = true
  try {
    const res = await api.aiConfirm(
      batchId.value,
      selectedRows.value.map((r) => ({ itemId: r.itemId, payload: r.payload })),
    )
    ElMessage.success(`已添加 ${res.total} 条日程`)
    const first = res.items[0]
    resetDrafts()
    await Promise.all([store.refresh(), store.loadLists(), loadHistory()])
    // 跳到日历并定位到第一条新日程所在的日期
    if (first) {
      await router.push({
        path: '/calendar',
        query: { date: dayjs(first.startAt).format('YYYY-MM-DD') },
      })
    }
  } catch {
    // 拦截器已提示
  } finally {
    confirming.value = false
  }
}

async function discard() {
  if (batchId.value) {
    try {
      await api.aiDiscard(batchId.value)
    } catch {
      // 丢弃失败不阻塞界面复位
    }
  }
  resetDrafts()
  ElMessage.info('已丢弃本次识别结果')
}

function resetDrafts() {
  rows.value = []
  batchId.value = ''
  text.value = ''
  clearImages()
}

// ---------- 历史记录 ----------

async function loadHistory() {
  try {
    const res = await api.aiBatches(1, 10)
    history.value = res.items
    historyTotal.value = res.total
  } catch {
    history.value = []
  }
}

const STATUS_TEXT: Record<string, { label: string; type: 'info' | 'success' | 'warning' }> = {
  pending: { label: '待确认', type: 'warning' },
  confirmed: { label: '已入库', type: 'success' },
  discarded: { label: '已丢弃', type: 'info' },
}

onMounted(async () => {
  window.addEventListener('paste', onPaste)
  await Promise.all([loadHistory(), api.aiCapability().then((c) => (capability.value = c))])
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
  clearImages()
})
</script>

<template>
  <div class="page inbox">
    <section class="panel">
      <div class="panel-head">
        <h3 class="panel-title">AI 图文识别</h3>
        <span class="muted hint">
          上传日程截图 / 会议通知 / 聊天记录，或直接输入一段文字，AI 会拆成结构化草稿供你确认
        </span>
      </div>

      <div class="panel-body">
        <el-alert
          v-if="!aiEnabled"
          type="warning"
          :closable="false"
          show-icon
          title="尚未配置 DeepSeek API Key"
          class="mb"
        >
          <template #default>
            <div class="alert-desc">
              到「设置 → AI 识别」填入你自己的 DeepSeek API Key 后即可使用文字/图片识别；站点管理员也可通过服务器环境变量配置全站兜底 Key。
            </div>
            <el-button class="mt-s" size="small" type="primary" @click="router.push('/settings?tab=ai')">
              去配置 Key
            </el-button>
          </template>
        </el-alert>
        <el-alert
          v-else-if="!visionEnabled"
          type="info"
          :closable="false"
          show-icon
          title="图片识别未开通，仅支持文字识别"
          description="当前未配置视觉模型（DeepSeek 的多模态模型）。可在「设置 → AI 识别」中填写视觉模型名后启用图片上传。"
          class="mb"
        />

        <div
          class="dropzone"
          :class="{ over: dragOver && visionEnabled }"
          :style="visionEnabled ? undefined : { opacity: 0.55, cursor: 'not-allowed' }"
          @click="visionEnabled && pickFiles()"
          @dragover.prevent="visionEnabled && (dragOver = true)"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="visionEnabled && onDrop($event)"
        >
          <el-icon :size="30"><UploadFilled /></el-icon>
          <p v-if="visionEnabled">
            把图片拖到这里，或<em>点击选择</em>，也可以直接 Ctrl+V 粘贴截图
          </p>
          <p v-else>图片识别未开通，拖拽与粘贴已禁用，下方仍可用文字描述日程</p>
          <p class="muted small">
            支持 jpg / png / webp，单张不超过 8MB，最多 {{ maxImages }} 张
          </p>
          <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            :disabled="!visionEnabled"
            @change="onFileChange"
          />
        </div>

        <div v-if="previews.length" class="thumbs">
          <figure v-for="(p, i) in previews" :key="p.url" class="thumb">
            <img :src="p.url" :alt="p.name" />
            <button class="thumb-del" title="移除" @click.stop="removeAt(i)">
              <el-icon><Delete /></el-icon>
            </button>
          </figure>
          <el-button link type="danger" size="small" @click="clearImages">清空图片</el-button>
        </div>

        <el-input
          v-model="text"
          type="textarea"
          :rows="5"
          maxlength="4000"
          show-word-limit
          placeholder="示例：下周三下午三点在公司三楼会议室开产品评审会，记得带原型稿；另外每周一早上九点半站会"
          class="mb"
        />

        <div class="actions">
          <el-button
            type="primary"
            :icon="MagicStick"
            :loading="parsing"
            :disabled="!aiEnabled"
            @click="parse"
          >
            {{ parsing ? 'AI 正在解析，约需 5-30 秒…' : '开始识别' }}
          </el-button>
          <span v-if="files.length" class="muted small">
            <el-icon><Picture /></el-icon>
            已选 {{ files.length }} 张图片
          </span>
        </div>
      </div>
    </section>

    <section v-if="rows.length" class="panel">
      <div class="panel-head">
        <h3 class="panel-title">识别结果（{{ rows.length }} 条）</h3>
        <div class="head-actions">
          <el-checkbox :model-value="allSelected" @change="toggleAll">全选</el-checkbox>
          <el-button link size="small" @click="invert">反选</el-button>
          <el-button size="small" @click="discard">丢弃</el-button>
          <el-button
            type="primary"
            size="small"
            :loading="confirming"
            @click="confirm"
          >
            确认添加 {{ selectedRows.length }} 条
          </el-button>
        </div>
      </div>

      <div class="panel-body drafts">
        <el-alert
          v-if="missingTime.length"
          type="warning"
          :closable="false"
          show-icon
          :title="`有 ${missingTime.length} 条未识别出时间，需手动补充后才能入库`"
        />
        <AiDraftCard
          v-for="(row, i) in rows"
          :key="row.itemId"
          v-model:selected="row.selected"
          :payload="row.payload"
          :index="i"
          @update="row.payload = $event"
        />
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3 class="panel-title">历史识别记录</h3>
        <span class="muted small">共 {{ historyTotal }} 次</span>
      </div>
      <div class="panel-body">
        <p v-if="!history.length" class="empty-tip">还没有识别记录</p>
        <el-table v-else :data="history" size="small" stripe>
          <el-table-column label="时间" width="160">
            <template #default="{ row }">{{ dayjs(row.createdAt).format('MM-DD HH:mm') }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="STATUS_TEXT[row.status]?.type ?? 'info'" effect="plain">
                {{ STATUS_TEXT[row.status]?.label ?? row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="原文摘要" min-width="220">
            <template #default="{ row }">
              <span class="ellipsis">{{ row.rawText || `（${row.images?.length ?? 0} 张图片）` }}</span>
            </template>
          </el-table-column>
          <el-table-column label="条数" width="90" align="center">
            <template #default="{ row }">{{ row.importedCount }} / {{ row.itemCount }}</template>
          </el-table-column>
          <el-table-column label="Token" width="120" align="center">
            <template #default="{ row }">
              {{ (row.usage?.promptTokens ?? 0) + (row.usage?.completionTokens ?? 0) }}
            </template>
          </el-table-column>
          <el-table-column label="模型" min-width="140">
            <template #default="{ row }">
              <span class="muted small">{{ row.model }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.inbox {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hint {
  font-size: 12px;
  max-width: 620px;
  text-align: right;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mb {
  margin-bottom: 12px;
}

.alert-desc {
  line-height: 1.6;
}

.mt-s {
  margin-top: 8px;
}

.small {
  font-size: 12px;
}

.dropzone {
  display: grid;
  place-items: center;
  gap: 4px;
  padding: 22px 16px;
  margin-bottom: 12px;
  border: 1px dashed #c0c4cc;
  border-radius: 8px;
  background: #fafbfc;
  color: var(--text-sub);
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.dropzone:hover,
.dropzone.over {
  border-color: #409eff;
  background: #ecf5ff;
  color: #409eff;
}

.dropzone p {
  margin: 0;
  font-size: 13px;
}

.dropzone em {
  font-style: normal;
  color: #409eff;
}

.thumbs {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.thumb {
  position: relative;
  margin: 0;
  width: 92px;
  height: 92px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  overflow: hidden;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-del {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: pointer;
  font-size: 12px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.drafts {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
