<script setup lang="ts">
import { reactive, watch } from 'vue'
import { WarningFilled } from '@element-plus/icons-vue'
import type { AiDraftPayload } from '@/api/types'
import { PRIORITY_OPTIONS } from '@/utils/color'
import { dayjs, pickerFormat, pickerType, toApiTime } from '@/utils/time'

const props = defineProps<{
  payload: AiDraftPayload
  selected: boolean
  index: number
}>()

const emit = defineEmits<{
  (e: 'update', patch: AiDraftPayload): void
  (e: 'update:selected', value: boolean): void
}>()

/** 本地副本：改动即时回抛给父组件，父组件持有唯一的草稿数组 */
const local = reactive<AiDraftPayload>({ ...props.payload })

watch(
  () => props.payload,
  (next) => Object.assign(local, next),
)

watch(
  local,
  () => emit('update', { ...local }),
  { deep: true },
)

/** el-date-picker 的字符串值，与 payload 里的 ISO / YYYY-MM-DD 双向换算 */
function pickerValue(value: string | null): string {
  if (!value) return ''
  return dayjs(value).format(local.allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ss')
}

function setStart(value: string | null) {
  local.startAt = value ? toApiTime(value, local.allDay) : null
}

function setEnd(value: string | null) {
  local.endAt = value ? toApiTime(value, local.allDay) : null
}

function onAllDayChange(allDay: boolean) {
  local.allDay = allDay
  if (local.startAt) local.startAt = toApiTime(local.startAt, allDay)
  if (local.endAt) local.endAt = toApiTime(local.endAt, allDay)
}

const needsAttention = () => local.needsReview || local.confidence < 0.6 || !local.startAt
</script>

<template>
  <div class="card" :class="{ warn: needsAttention(), off: !selected }">
    <header class="card-head">
      <el-checkbox
        :model-value="selected"
        @update:model-value="emit('update:selected', Boolean($event))"
      />
      <span class="card-index">#{{ index + 1 }}</span>
      <el-tag v-if="!local.startAt" size="small" type="warning" effect="dark">缺少时间</el-tag>
      <el-tag v-else-if="needsAttention()" size="small" type="warning" effect="plain">
        <el-icon class="tag-icon"><WarningFilled /></el-icon>
        置信度 {{ Math.round(local.confidence * 100) }}%，请核对
      </el-tag>
      <el-tag v-else size="small" type="success" effect="plain">
        置信度 {{ Math.round(local.confidence * 100) }}%
      </el-tag>
    </header>

    <div class="card-body">
      <el-input v-model="local.title" placeholder="日程标题" maxlength="200" />

      <div class="row">
        <el-switch
          :model-value="local.allDay"
          active-text="全天"
          @update:model-value="onAllDayChange(Boolean($event))"
        />
        <el-date-picker
          :model-value="pickerValue(local.startAt)"
          :type="pickerType(local.allDay)"
          :value-format="pickerFormat(local.allDay)"
          :format="local.allDay ? 'YYYY-MM-DD' : 'MM-DD HH:mm'"
          placeholder="开始时间"
          style="width: 180px"
          @update:model-value="setStart($event as string | null)"
        />
        <span class="sep">至</span>
        <el-date-picker
          :model-value="pickerValue(local.endAt)"
          :type="pickerType(local.allDay)"
          :value-format="pickerFormat(local.allDay)"
          :format="local.allDay ? 'YYYY-MM-DD' : 'MM-DD HH:mm'"
          placeholder="结束时间"
          style="width: 180px"
          @update:model-value="setEnd($event as string | null)"
        />
      </div>

      <div class="row">
        <el-select v-model="local.priority" style="width: 100px">
          <el-option v-for="opt in PRIORITY_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
        </el-select>
        <el-input v-model="local.listName" placeholder="清单名（不存在会自动创建）" style="width: 190px" />
        <el-input v-model="local.location" placeholder="地点" style="width: 190px" />
      </div>

      <div class="row">
        <el-input v-model="local.rrule" placeholder="重复规则，例如 RRULE:FREQ=WEEKLY;BYDAY=MO" clearable />
        <el-input-number
          v-model="local.remindBefore"
          :min="0"
          :max="1440"
          :step="5"
          placeholder="提前分钟"
          controls-position="right"
          style="width: 130px"
        />
      </div>

      <el-input
        v-model="local.notes"
        type="textarea"
        :rows="2"
        maxlength="2000"
        placeholder="备注"
      />
    </div>
  </div>
</template>

<style scoped>
.card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-panel);
  overflow: hidden;
  transition: opacity 0.15s, border-color 0.15s;
}

.card.warn {
  border-color: #f3d19e;
  background: #fffbf5;
}

.card.off {
  opacity: 0.5;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light);
  background: #fafafa;
}

.card-index {
  font-size: 12px;
  color: var(--text-sub);
  font-variant-numeric: tabular-nums;
}

.tag-icon {
  margin-right: 2px;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sep {
  color: var(--text-sub);
  font-size: 12px;
}
</style>
