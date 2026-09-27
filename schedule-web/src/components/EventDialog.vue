<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api'
import type { EditScope, EventInput, EventPriority, EventStatus, RrulePreset } from '@/api/types'
import { useEventsStore } from '@/stores/events'
import { useUiStore } from '@/stores/ui'
import { PRIORITY_OPTIONS } from '@/utils/color'
import {
  dayjs,
  fromUntilString,
  pickerFormat,
  pickerType,
  toApiTime,
  toUntilString,
} from '@/utils/time'

const ui = useUiStore()
const store = useEventsStore()

/** 重复下拉里的「自定义」哨兵值 */
const CUSTOM = '__custom__'

const FREQ_OPTIONS = [
  { value: 'DAILY', label: '按天' },
  { value: 'WEEKLY', label: '按周' },
  { value: 'MONTHLY', label: '按月' },
  { value: 'YEARLY', label: '按年' },
]

const BYDAY_OPTIONS = [
  { value: 'MO', label: '一' },
  { value: 'TU', label: '二' },
  { value: 'WE', label: '三' },
  { value: 'TH', label: '四' },
  { value: 'FR', label: '五' },
  { value: 'SA', label: '六' },
  { value: 'SU', label: '日' },
]

const SCOPE_OPTIONS: { value: EditScope; label: string; tip: string }[] = [
  { value: 'all', label: '整个日程', tip: '所有重复次数一起修改' },
  { value: 'single', label: '仅此次', tip: '把这一次拆成独立日程，其余次数保持不变' },
  { value: 'future', label: '此次及后续', tip: '原日程到上一次为止，此次开始按新设置重复' },
]

const presets = ref<RrulePreset[]>([])
const saving = ref(false)
const rruleSelect = ref('')
const scope = ref<EditScope>('all')
const custom = reactive({ freq: 'WEEKLY', interval: 1, byday: [] as string[], until: '' })

const form = reactive({
  title: '',
  listId: null as number | null,
  allDay: false,
  start: '',
  end: '',
  priority: 'medium' as EventPriority,
  status: 'todo' as EventStatus,
  location: '',
  notes: '',
  remind: true,
  remindBefore: null as number | null,
})

const item = computed(() => ui.dialogItem)
const isEdit = computed(() => ui.isEdit)
/** 只有编辑重复日程时才需要选择作用范围 */
const showScope = computed(() => isEdit.value && Boolean(item.value?.isRecurring))
const currentRrule = computed(() =>
  rruleSelect.value === CUSTOM ? buildRrule() : rruleSelect.value,
)
const valueFormat = computed(() => pickerFormat(form.allDay))
const dateType = computed(() => pickerType(form.allDay))
const displayFormat = computed(() => (form.allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm'))
const scopeTip = computed(() => SCOPE_OPTIONS.find((s) => s.value === scope.value)?.tip ?? '')

onMounted(async () => {
  try {
    presets.value = await api.rrulePresets()
  } catch {
    presets.value = []
  }
})

// ---------- 表单初始化 ----------

function toPickerValue(iso: string, allDay: boolean): string {
  return dayjs(iso).format(allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ss')
}

function defaultEnd(start: string, allDay: boolean): string {
  if (allDay) return ''
  return dayjs(start).add(1, 'hour').format('YYYY-MM-DDTHH:mm:ss')
}

/** 整体赋值（打开对话框 / 切换全天）时不要连带平移结束时间 */
let suppressShift = false

function reset() {
  const editing = item.value
  const preset = ui.dialogPreset
  scope.value = 'all'
  // 初始化时整体赋值，不让「平移结束时间」的 watch 插手
  suppressShift = true

  if (isEdit.value && editing) {
    form.title = editing.title
    form.listId = editing.listId
    form.allDay = editing.allDay
    form.start = toPickerValue(editing.startAt, editing.allDay)
    form.end = editing.endAt ? toPickerValue(editing.endAt, editing.allDay) : ''
    form.priority = editing.priority
    form.status = editing.status
    form.location = editing.location ?? ''
    form.notes = editing.notes ?? ''
    form.remind = editing.remind
    form.remindBefore = editing.remindBefore
    applyRrule(editing.rrule ?? '')
    nextTick(() => (suppressShift = false))
    return
  }

  const start = preset.start ?? dayjs().add(1, 'hour').minute(0).second(0).millisecond(0).format()
  form.title = ''
  form.listId = preset.listId ?? null
  form.allDay = preset.allDay ?? false
  form.start = toPickerValue(start, form.allDay)
  form.end = preset.end ? toPickerValue(preset.end, form.allDay) : defaultEnd(start, form.allDay)
  form.priority = 'medium'
  form.status = 'todo'
  form.location = ''
  form.notes = ''
  form.remind = true
  form.remindBefore = null
  applyRrule('')
  nextTick(() => (suppressShift = false))
}

watch(
  () => ui.dialogVisible,
  (visible) => {
    if (visible) reset()
  },
  { immediate: true },
)

// 只改开始时间时，结束时间按原时长跟着平移，避免「结束早于开始」把用户卡住
// （与后端 mergeForUpdate 的行为保持一致）
watch(
  () => form.start,
  (next, prev) => {
    if (suppressShift || !next || !prev || !form.end) return
    const delta = dayjs(next).valueOf() - dayjs(prev).valueOf()
    if (!delta) return
    form.end = dayjs(form.end).add(delta, 'millisecond').format(valueFormat.value)
  },
)

// 切换全天时把已选值改写成对应格式，避免日期选择器报格式错误
watch(
  () => form.allDay,
  (allDay) => {
    suppressShift = true
    if (form.start) form.start = toPickerValue(form.start, allDay)
    const converted = form.end ? toPickerValue(form.end, allDay) : ''
    // 结束不晚于开始时直接清空：全天事件交给后端补到当天 23:59:59
    form.end =
      converted && dayjs(converted).isAfter(dayjs(form.start))
        ? converted
        : defaultEnd(form.start, allDay)
    nextTick(() => (suppressShift = false))
  },
)

// ---------- 重复规则 ----------

const pickRule = (rule: string, key: string): string =>
  rule.match(new RegExp(`(?:^|;)${key}=([^;]*)`))?.[1] ?? ''

function parseRrule(rule: string) {
  custom.freq = pickRule(rule, 'FREQ') || 'WEEKLY'
  custom.interval = Number(pickRule(rule, 'INTERVAL') || 1) || 1
  custom.byday = pickRule(rule, 'BYDAY')
    .split(',')
    .map((s) => s.trim().slice(0, 2))
    .filter(Boolean)
  const until = pickRule(rule, 'UNTIL')
  custom.until = until ? fromUntilString(until) : ''
}

function buildRrule(): string {
  const parts = [`FREQ=${custom.freq}`]
  if (custom.interval > 1) parts.push(`INTERVAL=${custom.interval}`)
  if (custom.freq === 'WEEKLY' && custom.byday.length) parts.push(`BYDAY=${custom.byday.join(',')}`)
  if (custom.until) parts.push(`UNTIL=${toUntilString(custom.until)}`)
  return `RRULE:${parts.join(';')}`
}

function applyRrule(rule: string) {
  if (!rule) {
    rruleSelect.value = ''
    custom.freq = 'WEEKLY'
    custom.interval = 1
    custom.byday = []
    custom.until = ''
    return
  }
  if (presets.value.some((p) => p.value === rule)) {
    rruleSelect.value = rule
    return
  }
  rruleSelect.value = CUSTOM
  parseRrule(rule)
}

// 从预设切到「自定义」时，默认按开始时间所在的星期重复
watch(rruleSelect, (value) => {
  if (value !== CUSTOM || custom.byday.length) return
  custom.byday = [BYDAY_OPTIONS[(dayjs(form.start).day() + 6) % 7].value]
})

// ---------- 提交 ----------

async function submit() {
  if (!form.title.trim()) {
    ElMessage.warning('请填写日程标题')
    return
  }
  if (!form.start) {
    ElMessage.warning('请选择开始时间')
    return
  }

  const start = toApiTime(form.start, form.allDay)
  let end = form.end ? toApiTime(form.end, form.allDay) : null
  if (end && dayjs(end).valueOf() < dayjs(start).valueOf()) {
    ElMessage.warning('结束时间必须晚于开始时间')
    return
  }
  // 开始与结束相同：全天事件就是「当天一整天」，定时事件则无法构成区间
  if (end && dayjs(end).valueOf() === dayjs(start).valueOf()) {
    if (!form.allDay) {
      ElMessage.warning('结束时间必须晚于开始时间')
      return
    }
    end = null
  }

  const input: EventInput = {
    title: form.title.trim(),
    start,
    end,
    allDay: form.allDay,
    listId: form.listId,
    rrule: currentRrule.value || null,
    priority: form.priority,
    status: form.status,
    location: form.location.trim() || null,
    notes: form.notes.trim() || null,
    remind: form.remind,
    remindBefore: form.remind ? form.remindBefore : null,
  }

  saving.value = true
  try {
    if (isEdit.value && item.value) {
      await store.updateEvent(item.value, input, scope.value)
      ElMessage.success('已保存')
    } else {
      await store.createEvent(input)
      ElMessage.success('已添加日程')
    }
    ui.close()
  } catch {
    // 错误提示已由 axios 响应拦截器统一弹出
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!item.value) return
  const label = SCOPE_OPTIONS.find((s) => s.value === scope.value)?.label ?? '日程'
  try {
    await ElMessageBox.confirm(`确定删除「${label}」吗？该操作不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  try {
    await store.removeEvent(item.value, scope.value)
    ElMessage.success('已删除')
    ui.close()
  } catch {
    // 同上，拦截器已提示
  }
}
</script>

<template>
  <el-dialog
    v-model="ui.dialogVisible"
    :title="isEdit ? '编辑日程' : '新建日程'"
    width="620px"
    :fullscreen="ui.isMobile"
    top="6vh"
    append-to-body
  >
    <el-form label-width="82px" label-position="right" @submit.prevent>
      <el-form-item label="标题" required>
        <el-input
          v-model="form.title"
          placeholder="例如：和产品组开评审会"
          maxlength="200"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="清单">
        <el-select v-model="form.listId" placeholder="未分组" clearable style="width: 100%">
          <el-option
            v-for="opt in store.listOptions"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
          >
            <span class="opt-row">
              <i class="prio-dot" :style="{ background: opt.color }" />
              {{ opt.label }}
            </span>
          </el-option>
        </el-select>
      </el-form-item>

      <el-form-item label="全天">
        <el-switch v-model="form.allDay" />
      </el-form-item>

      <el-form-item label="开始">
        <el-date-picker
          v-model="form.start"
          :type="dateType"
          :format="displayFormat"
          :value-format="valueFormat"
          placeholder="选择开始时间"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="结束">
        <el-date-picker
          v-model="form.end"
          :type="dateType"
          :format="displayFormat"
          :value-format="valueFormat"
          placeholder="可留空"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="重复">
        <el-select v-model="rruleSelect" placeholder="不重复" clearable style="width: 100%">
          <el-option v-for="p in presets" :key="p.label" :value="p.value" :label="p.label" />
          <el-option :value="CUSTOM" label="自定义…" />
        </el-select>

        <div v-if="rruleSelect === CUSTOM" class="custom-rule">
          <div class="rule-row">
            <span>每</span>
            <el-input-number v-model="custom.interval" :min="1" :max="99" size="small" />
            <el-select v-model="custom.freq" size="small" style="width: 96px">
              <el-option v-for="f in FREQ_OPTIONS" :key="f.value" :value="f.value" :label="f.label" />
            </el-select>
            <span>重复一次</span>
          </div>
          <div v-if="custom.freq === 'WEEKLY'" class="rule-row">
            <span>星期</span>
            <el-checkbox-group v-model="custom.byday" size="small">
              <el-checkbox-button v-for="d in BYDAY_OPTIONS" :key="d.value" :value="d.value">
                {{ d.label }}
              </el-checkbox-button>
            </el-checkbox-group>
          </div>
          <div class="rule-row">
            <span>截止到</span>
            <el-date-picker
              v-model="custom.until"
              type="date"
              value-format="YYYY-MM-DDTHH:mm:ss"
              placeholder="永不结束"
              size="small"
              style="width: 180px"
            />
          </div>
          <div class="rule-preview muted">{{ currentRrule }}</div>
        </div>
      </el-form-item>

      <el-form-item v-if="showScope" label="修改范围">
        <div class="scope-box">
          <el-radio-group v-model="scope">
            <el-radio v-for="s in SCOPE_OPTIONS" :key="s.value" :value="s.value">
              {{ s.label }}
            </el-radio>
          </el-radio-group>
          <div class="muted scope-tip">{{ scopeTip }}</div>
        </div>
      </el-form-item>

      <el-form-item label="优先级">
        <el-radio-group v-model="form.priority">
          <el-radio-button v-for="p in PRIORITY_OPTIONS" :key="p.value" :value="p.value">
            {{ p.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="isEdit" label="状态">
        <el-select v-model="form.status" style="width: 100%">
          <el-option value="todo" label="待办" />
          <el-option value="doing" label="进行中" />
          <el-option value="done" label="已完成" />
          <el-option value="cancelled" label="已取消" />
        </el-select>
      </el-form-item>

      <el-form-item label="地点">
        <el-input v-model="form.location" placeholder="可留空" maxlength="200" />
      </el-form-item>

      <el-form-item label="提醒">
        <div class="remind-row">
          <el-switch v-model="form.remind" />
          <template v-if="form.remind">
            <span class="remind-label">提前</span>
            <el-input-number
              v-model="form.remindBefore"
              :min="0"
              :max="1440"
              :step="5"
              size="small"
              placeholder="默认"
            />
            <span class="remind-label">分钟（留空用账号默认值）</span>
          </template>
        </div>
      </el-form-item>

      <el-form-item label="备注">
        <el-input
          v-model="form.notes"
          type="textarea"
          :rows="3"
          maxlength="5000"
          show-word-limit
          placeholder="可留空"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button v-if="isEdit" type="danger" plain @click="remove">删除</el-button>
        <span class="spacer" />
        <el-button @click="ui.close()">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">
          {{ isEdit ? '保存' : '添加' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.opt-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.custom-rule {
  width: 100%;
  margin-top: 10px;
  padding: 10px 12px;
  background: #f7f8fa;
  border-radius: 6px;
}

.rule-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.rule-row:last-of-type {
  margin-bottom: 0;
}

.rule-preview {
  margin-top: 8px;
  font-size: 12px;
  word-break: break-all;
}

.scope-box {
  width: 100%;
}

.scope-tip {
  font-size: 12px;
  line-height: 1.6;
}

.remind-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.remind-label {
  margin: 0 6px;
  color: var(--text-sub);
}

.dialog-footer {
  display: flex;
  align-items: center;
}

.spacer {
  flex: 1;
}
</style>
