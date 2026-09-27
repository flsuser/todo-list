<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import CalendarToolbar from '@/components/calendar/CalendarToolbar.vue'
import MonthGrid from '@/components/calendar/MonthGrid.vue'
import TimeGrid from '@/components/calendar/TimeGrid.vue'
import { api } from '@/api'
import type { EventItem } from '@/api/types'
import { useEventsStore } from '@/stores/events'
import type { CalendarMode } from '@/stores/settings'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { Dayjs } from '@/utils/time'
import { dayjs, monthMatrix, shiftDate, weekDays } from '@/utils/time'

const route = useRoute()
const router = useRouter()
const store = useEventsStore()
const settings = useSettingsStore()
const ui = useUiStore()

const mode = ref<CalendarMode>(settings.prefs.calendarMode)
const date = ref<Dayjs>(parseQueryDate())
/** 推送链接带过来的定位目标，高亮几秒后自动清除 */
const focusId = ref<number | null>(null)

function parseQueryDate(): Dayjs {
  const raw = route.query.date
  if (typeof raw === 'string' && raw) {
    const parsed = dayjs(raw)
    if (parsed.isValid()) return parsed
  }
  return dayjs()
}

/** 月视图的 6×7 网格 */
const monthRows = computed<Dayjs[][]>(() =>
  mode.value === 'month' ? monthMatrix(date.value) : [],
)

/** 周/日视图的列；周视图可隐藏周末 */
const gridDays = computed<Dayjs[]>(() => {
  if (mode.value === 'day') return [date.value.startOf('day')]
  const all = weekDays(date.value)
  return settings.prefs.showWeekend ? all : all.slice(0, 5)
})

const rangeFrom = computed<Dayjs | null>(() => {
  if (mode.value === 'month') return monthRows.value[0]?.[0]?.startOf('day') ?? null
  return gridDays.value[0]?.startOf('day') ?? null
})

const rangeTo = computed<Dayjs | null>(() => {
  if (mode.value === 'month') {
    const rows = monthRows.value
    return rows.length ? rows[rows.length - 1][6].endOf('day') : null
  }
  const days = gridDays.value
  return days.length ? days[days.length - 1].endOf('day') : null
})

/** 已取消的日程默认隐藏，可在下方开关打开 */
const visibleItems = computed<EventItem[]>(() =>
  settings.prefs.showCancelled
    ? store.items
    : store.items.filter((i) => i.status !== 'cancelled'),
)

async function load() {
  if (!rangeFrom.value || !rangeTo.value) return
  await store.loadRange(rangeFrom.value.format(), rangeTo.value.format())
}

watch([rangeFrom, rangeTo], load, { immediate: true })

// 视图状态同步到地址栏，便于分享与浏览器前进后退
watch([mode, date], () => {
  settings.set('calendarMode', mode.value)
  router
    .replace({
      path: '/calendar',
      query: { mode: mode.value, date: date.value.format('YYYY-MM-DD') },
    })
    .catch(() => undefined)
})

// 侧栏迷你月历、推送链接都会改写 query.date，这里跟随跳转
watch(
  () => route.query.date,
  (raw) => {
    if (typeof raw !== 'string' || !raw) return
    const next = dayjs(raw)
    if (next.isValid() && !next.isSame(date.value, 'day')) date.value = next
  },
)

function onModeChange(value: CalendarMode) {
  mode.value = value
}

function onShift(step: number) {
  date.value = shiftDate(date.value, mode.value, step)
}

function onToday() {
  date.value = dayjs()
}

function onPick(value: string) {
  const next = dayjs(value)
  if (next.isValid()) date.value = next
}

function onCreate(preset: { start?: string; allDay?: boolean }) {
  ui.openCreate({ start: preset.start, allDay: preset.allDay })
}

/** 时间轴上点空白新建：带上点击处的小时与分钟 */
function onTimeCreate(preset: { date: Dayjs; minutes: number }) {
  ui.openCreate({
    start: preset.date.startOf('day').add(preset.minutes, 'minute').format(),
    allDay: false,
  })
}

function onOpen(item: EventItem) {
  ui.openEdit(item)
}

function onShowDay(target: Dayjs) {
  mode.value = 'day'
  date.value = target
}

/** 月视图拖动只换日期，时刻与时长保持不变 */
function onMonthMove(item: EventItem, start: Dayjs) {
  const end = item.endAt
    ? start.add(dayjs(item.endAt).diff(dayjs(item.startAt), 'minute'), 'minute')
    : null
  store.moveEvent(item, start, end).catch(() => ElMessage.error('移动失败，已还原'))
}

function onTimeMove(item: EventItem, start: Dayjs, end: Dayjs) {
  store.moveEvent(item, start, end).catch(() => ElMessage.error('移动失败，已还原'))
}

function onResize(item: EventItem, end: Dayjs) {
  store.moveEvent(item, dayjs(item.startAt), end).catch(() => ElMessage.error('调整失败，已还原'))
}

onMounted(async () => {
  // 推送消息里的 ?focus=<id> 需要把日历定位到那条日程所在的日期
  const target = ui.focusEventId
  ui.setFocus(null)
  if (!target) return
  try {
    const event = await api.event(target)
    date.value = dayjs(event.startAt)
    focusId.value = event.id
    window.setTimeout(() => {
      focusId.value = null
    }, 5000)
  } catch {
    // 日程可能已被删除，忽略即可
  }
})
</script>

<template>
  <div class="page calendar-page">
    <CalendarToolbar
      :mode="mode"
      :date="date"
      @update:mode="onModeChange"
      @shift="onShift"
      @today="onToday"
      @pick="onPick"
      @create="onCreate({})"
    />

    <div class="filter-bar">
      <span class="muted count">共 {{ visibleItems.length }} 条</span>
      <el-checkbox
        v-if="mode === 'week'"
        :model-value="settings.prefs.showWeekend"
        @change="settings.set('showWeekend', Boolean($event))"
      >
        显示周末
      </el-checkbox>
      <el-checkbox
        :model-value="settings.prefs.showCancelled"
        @change="settings.set('showCancelled', Boolean($event))"
      >
        显示已取消
      </el-checkbox>
      <span class="muted hint">拖动色块可改期，双击日期号进入日视图</span>
    </div>

    <div v-loading="store.loading" class="calendar-body">
      <MonthGrid
        v-if="mode === 'month'"
        :rows="monthRows"
        :current="date"
        :items="visibleItems"
        :focus-id="focusId"
        @create="onCreate"
        @open="onOpen"
        @move="onMonthMove"
        @show-day="onShowDay"
      />
      <TimeGrid
        v-else
        :days="gridDays"
        :items="visibleItems"
        :focus-id="focusId"
        @create="onTimeCreate"
        @open="onOpen"
        @move="onTimeMove"
        @resize="onResize"
        @show-day="onShowDay"
      />
    </div>
  </div>
</template>

<style scoped>
.calendar-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 13px;
}

.filter-bar .hint {
  margin-left: auto;
  font-size: 12px;
}

.calendar-body {
  min-height: 420px;
}

.calendar-body :deep(.tg) {
  height: calc(100vh - var(--header-h) - 168px);
  min-height: 460px;
}
</style>
