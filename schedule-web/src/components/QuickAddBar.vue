<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick } from '@element-plus/icons-vue'
import { api } from '@/api'
import type { AiDraftPayload } from '@/api/types'
import { useEventsStore } from '@/stores/events'
import { PRIORITY_OPTIONS } from '@/utils/color'
import { dayjs, pickerFormat, pickerType, toApiTime } from '@/utils/time'

interface Row {
  itemId: number
  payload: AiDraftPayload
  checked: boolean
}

const store = useEventsStore()

const text = ref('')
const loading = ref(false)
const confirming = ref(false)
const popoverVisible = ref(false)
const batchId = ref('')
const rows = ref<Row[]>([])
const aiDisabledReason = ref('')

const checkedCount = computed(() => rows.value.filter((r) => r.checked).length)
const allChecked = computed(
  () => rows.value.length > 0 && rows.value.every((r) => r.checked),
)

/** 头部快速添加只走纯文本，图片识别请到 AI 识别页 */
async function parse() {
  const value = text.value.trim()
  if (!value) {
    ElMessage.warning('先说点什么，例如「明天下午三点和张总开会」')
    return
  }

  loading.value = true
  try {
    const res = await api.aiParse(value, [])
    if (!res.items.length) {
      ElMessage.info('没有识别出日程，试试写得更具体一些')
      return
    }
    batchId.value = res.batchId
    rows.value = res.items.map((i) => ({
      itemId: i.itemId,
      payload: { ...i.payload },
      checked: true,
    }))
    popoverVisible.value = true
  } catch {
    // 未配置 API Key / 网络异常等，拦截器已提示；这里记录原因便于展示占位文案
    aiDisabledReason.value = 'AI 识别暂不可用，可到「AI 识别」页查看详情或手动新建'
  } finally {
    loading.value = false
  }
}

function toggleAll() {
  const next = !allChecked.value
  rows.value.forEach((r) => (r.checked = next))
}

async function confirm() {
  const chosen = rows.value.filter((r) => r.checked)
  if (!chosen.length) {
    ElMessage.warning('请至少勾选一条')
    return
  }
  const missing = chosen.find((r) => !r.payload.startAt)
  if (missing) {
    ElMessage.warning(`「${missing.payload.title}」还缺时间，请补上或取消勾选`)
    return
  }

  confirming.value = true
  try {
    const res = await api.aiConfirm(
      batchId.value,
      chosen.map((r) => ({ itemId: r.itemId, payload: r.payload })),
    )
    ElMessage.success(`已添加 ${res.total} 条日程`)
    close()
    await Promise.all([store.refresh(), store.loadLists()])
  } catch {
    // 拦截器已提示
  } finally {
    confirming.value = false
  }
}

async function discard() {
  if (!batchId.value) return close()
  try {
    await api.aiDiscard(batchId.value)
  } catch {
    // 丢弃失败不影响关闭浮层
  }
  close()
}

function close() {
  popoverVisible.value = false
  rows.value = []
  batchId.value = ''
  text.value = ''
}

/** el-date-picker 需要的字符串值 */
function timeValue(row: Row): string {
  if (!row.payload.startAt) return ''
  return dayjs(row.payload.startAt).format(
    row.payload.allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ss',
  )
}

function setTime(row: Row, value: string | null) {
  if (!value) {
    row.payload.startAt = null
    return
  }
  row.payload.startAt = toApiTime(value, row.payload.allDay)
}
</script>

<template>
  <el-popover
    :visible="popoverVisible"
    placement="bottom-start"
    :width="480"
    :show-arrow="false"
    popper-class="quick-add-popper"
  >
    <template #reference>
      <div class="quick-add">
        <el-input
          v-model="text"
          placeholder="一句话添加：明天下午3点和张总开会 / 每周一9点站会"
          clearable
          :disabled="loading"
          @keyup.enter="parse"
        >
          <template #prefix>
            <el-icon><MagicStick /></el-icon>
          </template>
          <template #append>
            <el-button :loading="loading" @click="parse">AI 识别</el-button>
          </template>
        </el-input>
      </div>
    </template>

    <div class="drafts">
      <div class="drafts-head">
        <el-checkbox :model-value="allChecked" @change="toggleAll">
          全选（已选 {{ checkedCount }} 条）
        </el-checkbox>
        <span class="muted">识别结果可直接修改，确认后写入日程</span>
      </div>

      <div class="drafts-body thin-scroll">
        <div v-for="row in rows" :key="row.itemId" class="draft" :class="{ warn: !row.payload.startAt }">
          <el-checkbox v-model="row.checked" />
          <div class="draft-main">
            <el-input v-model="row.payload.title" size="small" placeholder="标题" />
            <div class="draft-row">
              <el-switch v-model="row.payload.allDay" size="small" active-text="全天" />
              <el-date-picker
                :model-value="timeValue(row)"
                :type="pickerType(row.payload.allDay)"
                :value-format="pickerFormat(row.payload.allDay)"
                :format="row.payload.allDay ? 'YYYY-MM-DD' : 'MM-DD HH:mm'"
                size="small"
                placeholder="选择时间"
                style="width: 170px"
                @update:model-value="setTime(row, $event as string | null)"
              />
              <el-select v-model="row.payload.priority" size="small" style="width: 82px">
                <el-option
                  v-for="opt in PRIORITY_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                  :label="opt.label"
                />
              </el-select>
            </div>
            <div v-if="!row.payload.startAt" class="warn-text">未识别出时间，请手动选择</div>
          </div>
        </div>
      </div>

      <div v-if="aiDisabledReason" class="muted tip">{{ aiDisabledReason }}</div>

      <div class="drafts-foot">
        <el-button size="small" @click="discard">丢弃</el-button>
        <el-button size="small" type="primary" :loading="confirming" @click="confirm">
          确认添加 {{ checkedCount }} 条
        </el-button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.quick-add {
  width: 100%;
  min-width: 260px;
}

.drafts {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drafts-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.drafts-body {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.draft {
  display: flex;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
}

.draft.warn {
  border-color: #f3d19e;
  background: #fdf6ec;
}

.draft-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.draft-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.warn-text {
  font-size: 12px;
  color: #e6a23c;
}

.tip {
  font-size: 12px;
}

.drafts-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--border-light);
  padding-top: 8px;
}
</style>
