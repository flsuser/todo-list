<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { EventItem } from '@/api/types'
import EventChip from '@/components/EventChip.vue'
import { blockStyle as blockColor } from '@/utils/color'
import { eventColor } from '@/utils/color'
import { startPointerDrag } from '@/utils/drag'
import type { Dayjs } from '@/utils/time'
import {
  dayjs,
  isToday,
  minutesToPx,
  pxToSnappedMinutes,
  timeLabel,
  WEEK_LABELS,
} from '@/utils/time'

const props = defineProps<{
  days: Dayjs[]
  items: EventItem[]
  focusId?: number | null
}>()

const emit = defineEmits<{
  (e: 'create', preset: { date: Dayjs; minutes: number }): void
  (e: 'open', item: EventItem): void
  (e: 'move', item: EventItem, start: Dayjs, end: Dayjs): void
  (e: 'resize', item: EventItem, end: Dayjs): void
  (e: 'show-day', date: Dayjs): void
}>()

/** 事件块最短可视高度对应的分钟数 */
const MIN_MINUTES = 20

const bodyRef = ref<HTMLElement | null>(null)
const colsRef = ref<HTMLElement | null>(null)
const nowMinutes = ref(dayjs().hour() * 60 + dayjs().minute())
/** 拖拽结束后短暂屏蔽 click，避免拖完顺手弹出编辑框 */
let suppressClickUntil = 0
let nowTimer: number | undefined

interface DragState {
  key: string
  dayKey: string
  startMin: number
  endMin: number
}

const drag = ref<DragState | null>(null)
const resizing = ref<{ key: string; endMin: number } | null>(null)

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const dayKey = (d: Dayjs) => d.format('YYYY-MM-DD')

// ---------- 布局计算 ----------

interface RawBlock {
  key: string
  item: EventItem
  dayKey: string
  startMin: number
  endMin: number
}

interface Positioned extends RawBlock {
  col: number
  cols: number
}

/** 跨天事件在覆盖到的每一天各画一段 */
const rawBlocks = computed<RawBlock[]>(() => {
  const out: RawBlock[] = []
  const keys = new Set(props.days.map(dayKey))

  for (const it of props.items) {
    if (it.allDay) continue
    const start = dayjs(it.startAt)
    const end = it.endAt ? dayjs(it.endAt) : start.add(60, 'minute')

    for (let cursor = start.startOf('day'); cursor.isSameOrBefore(end, 'day'); cursor = cursor.add(1, 'day')) {
      const key = dayKey(cursor)
      if (!keys.has(key)) continue
      const startMin = clamp(start.diff(cursor, 'minute'), 0, 1440)
      const endMin = clamp(Math.max(end.diff(cursor, 'minute'), startMin + MIN_MINUTES), startMin + MIN_MINUTES, 1440)
      out.push({
        key: `${it.id}-${it.occurrenceId ?? 0}-${key}`,
        item: it,
        dayKey: key,
        startMin,
        endMin,
      })
      // 单天事件不需要继续往后遍历
      if (!it.endAt || end.isSame(cursor, 'day')) break
    }
  }
  return out
})

/** 应用拖拽/缩放中的临时位置，实现跟手的实时预览 */
const displayBlocks = computed<RawBlock[]>(() => {
  const d = drag.value
  const r = resizing.value
  if (!d && !r) return rawBlocks.value
  return rawBlocks.value.map((b) => {
    if (d && b.key === d.key) return { ...b, dayKey: d.dayKey, startMin: d.startMin, endMin: d.endMin }
    if (r && b.key === r.key) return { ...b, endMin: Math.max(b.startMin + MIN_MINUTES, r.endMin) }
    return b
  })
})

/** 同一天内互相重叠的事件按列切分宽度，避免完全遮挡 */
const blocksByDay = computed(() => {
  const map = new Map<string, Positioned[]>()
  for (const day of props.days) map.set(dayKey(day), [])
  for (const b of displayBlocks.value) map.get(b.dayKey)?.push({ ...b, col: 0, cols: 1 })

  for (const arr of map.values()) {
    arr.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
    const clusters: Positioned[][] = []
    let current: Positioned[] = []
    let clusterEnd = -1
    for (const b of arr) {
      if (current.length && b.startMin >= clusterEnd) {
        clusters.push(current)
        current = []
        clusterEnd = -1
      }
      current.push(b)
      clusterEnd = Math.max(clusterEnd, b.endMin)
    }
    if (current.length) clusters.push(current)

    for (const cluster of clusters) {
      const columnEnds: number[] = []
      for (const b of cluster) {
        let col = columnEnds.findIndex((end) => end <= b.startMin)
        if (col === -1) {
          columnEnds.push(b.endMin)
          col = columnEnds.length - 1
        } else {
          columnEnds[col] = b.endMin
        }
        b.col = col
      }
      for (const b of cluster) b.cols = columnEnds.length
    }
  }
  return map
})

const allDayByDay = computed(() => {
  const map = new Map<string, EventItem[]>()
  for (const day of props.days) map.set(dayKey(day), [])
  for (const it of props.items) {
    if (!it.allDay) continue
    const start = dayjs(it.startAt).startOf('day')
    const end = it.endAt ? dayjs(it.endAt).startOf('day') : start
    for (let c = start; c.isSameOrBefore(end, 'day'); c = c.add(1, 'day')) {
      map.get(dayKey(c))?.push(it)
    }
  }
  return map
})

const hasAllDay = computed(() => [...allDayByDay.value.values()].some((arr) => arr.length > 0))

const nowTop = computed(() => minutesToPx(nowMinutes.value))

function styleOf(b: Positioned): Record<string, string> {
  const widthPct = 100 / b.cols
  return {
    top: `${minutesToPx(b.startMin)}px`,
    height: `${Math.max(20, minutesToPx(b.endMin - b.startMin) - 2)}px`,
    left: `calc(${b.col * widthPct}% + 2px)`,
    width: `calc(${widthPct}% - 4px)`,
    ...blockColor(eventColor(b.item)),
  }
}

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

/** 列数随周/日视图变化，用内联样式避开 CSS 变量代入 repeat() 的兼容性差异 */
const gridColumns = computed(() => `repeat(${props.days.length}, minmax(0, 1fr))`)

// ---------- 交互 ----------

/** 拖拽开始时先量好各列位置，避免 elementFromPoint 命中被拖动的元素本身 */
function measureColumns(): { key: string; left: number; right: number }[] {
  const cols = colsRef.value?.querySelectorAll<HTMLElement>('[data-date]') ?? []
  return [...cols].map((el) => {
    const rect = el.getBoundingClientRect()
    return { key: el.dataset.date ?? '', left: rect.left, right: rect.right }
  })
}

function hitColumn(clientX: number, columns: { key: string; left: number; right: number }[]): string | null {
  // 超出左右边界时吸附到首/末列，拖到边缘也能换天
  if (!columns.length) return null
  if (clientX < columns[0].left) return columns[0].key
  const last = columns[columns.length - 1]
  if (clientX > last.right) return last.key
  return columns.find((c) => clientX >= c.left && clientX <= c.right)?.key ?? null
}

function onEventPointerDown(b: Positioned, e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()

  const origin = { dayKey: b.dayKey, startMin: b.startMin, endMin: b.endMin }
  const duration = origin.endMin - origin.startMin
  const columns = measureColumns()

  startPointerDrag(e, {
    onMove: (_dx, dy, ev) => {
      const startMin = clamp(origin.startMin + pxToSnappedMinutes(dy), 0, 1440 - duration)
      drag.value = {
        key: b.key,
        startMin,
        endMin: startMin + duration,
        dayKey: hitColumn(ev.clientX, columns) ?? origin.dayKey,
      }
    },
    onEnd: (_ev, moved) => {
      const state = drag.value
      drag.value = null
      // 未真正拖动时交给 click 处理，避免重复弹出编辑框
      if (!moved || !state) return
      suppressClickUntil = Date.now() + 250
      if (state.dayKey === origin.dayKey && state.startMin === origin.startMin) return
      const start = dayjs(`${state.dayKey}T00:00:00`).add(state.startMin, 'minute')
      emit('move', b.item, start, start.add(duration, 'minute'))
    },
  })
}

function onResizePointerDown(b: Positioned, e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()

  const originEnd = b.endMin
  const originTopPx = minutesToPx(b.startMin)

  startPointerDrag(e, {
    onMove: (_dx, dy) => {
      resizing.value = {
        key: b.key,
        endMin: clamp(pxToSnappedMinutes(originTopPx + dy), b.startMin + MIN_MINUTES, 1440),
      }
    },
    onEnd: (_ev, moved) => {
      const state = resizing.value
      resizing.value = null
      if (!moved || !state) return
      suppressClickUntil = Date.now() + 250
      if (state.endMin === originEnd) return
      emit('resize', b.item, dayjs(`${b.dayKey}T00:00:00`).add(state.endMin, 'minute'))
    },
  })
}

/** 点空白处按当时的时间新建日程 */
function onColClick(day: Dayjs, e: MouseEvent) {
  if (Date.now() < suppressClickUntil) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const minutes = clamp(pxToSnappedMinutes(e.clientY - rect.top), 0, 1440 - 30)
  emit('create', { date: day, minutes })
}

function onEventClick(item: EventItem) {
  if (Date.now() < suppressClickUntil) return
  emit('open', item)
}

onMounted(() => {
  // 打开时定位到早上 8 点，比停在 00:00 更符合使用习惯
  if (bodyRef.value) bodyRef.value.scrollTop = Math.max(0, minutesToPx(8 * 60) - 20)
  nowTimer = window.setInterval(() => {
    nowMinutes.value = dayjs().hour() * 60 + dayjs().minute()
  }, 60_000)
})

onBeforeUnmount(() => {
  if (nowTimer) window.clearInterval(nowTimer)
})
</script>

<template>
  <div class="tg">
    <div class="tg-head">
      <div class="tg-gutter tg-gutter-head" />
      <div class="tg-head-cols" :style="{ gridTemplateColumns: gridColumns }">
        <div
          v-for="(day, i) in days"
          :key="dayKey(day)"
          class="tg-head-cell"
          :class="{ today: isToday(day) }"
        >
          <span class="wd">{{ WEEK_LABELS[i] }}</span>
          <button class="dn" @click="emit('show-day', day)">{{ day.date() }}</button>
        </div>
      </div>
    </div>

    <div v-if="hasAllDay" class="tg-allday">
      <div class="tg-gutter tg-allday-label">全天</div>
      <div class="tg-allday-cols" :style="{ gridTemplateColumns: gridColumns }">
        <div v-for="day in days" :key="`ad-${dayKey(day)}`" class="tg-allday-col">
          <EventChip
            v-for="it in allDayByDay.get(dayKey(day)) ?? []"
            :key="`${it.id}-${it.occurrenceId}`"
            :item="it"
            compact
            :focused="focusId === it.id"
            @click="emit('open', it)"
          />
        </div>
      </div>
    </div>

    <div ref="bodyRef" class="tg-body thin-scroll">
      <div class="tg-gutter">
        <div v-for="h in HOURS" :key="h" class="tg-hour">
          <span>{{ h }}</span>
        </div>
      </div>

      <div ref="colsRef" class="tg-cols" :style="{ gridTemplateColumns: gridColumns }">
        <div
          v-for="(day, i) in days"
          :key="dayKey(day)"
          class="tg-col"
          :class="{ weekend: i >= 5, today: isToday(day) }"
          :data-date="dayKey(day)"
          @click="onColClick(day, $event)"
        >
          <div v-for="s in 48" :key="s" class="tg-slot" :class="{ hour: s % 2 === 0 }" />

          <div
            v-for="b in blocksByDay.get(dayKey(day)) ?? []"
            :key="b.key"
            class="tg-event"
            :class="{
              done: b.item.status === 'done',
              cancelled: b.item.status === 'cancelled',
              focused: focusId === b.item.id,
              dragging: drag?.key === b.key || resizing?.key === b.key,
            }"
            :style="styleOf(b)"
            @click.stop="onEventClick(b.item)"
            @pointerdown="onEventPointerDown(b, $event)"
          >
            <div class="ev-title">{{ b.item.title }}</div>
            <div class="ev-time">
              {{ timeLabel(b.item) }}<template v-if="b.item.endAt"> - {{ dayjs(b.item.endAt).format('HH:mm') }}</template>
            </div>
            <div class="ev-resize" @pointerdown="onResizePointerDown(b, $event)" />
          </div>

          <div v-if="isToday(day)" class="tg-now" :style="{ top: `${nowTop}px` }" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tg {
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow: hidden;
}

.tg-head,
.tg-allday {
  display: flex;
  flex: none;
  border-bottom: 1px solid var(--border-light);
}

.tg-allday {
  background: #fcfdff;
}

.tg-gutter {
  width: var(--time-col-w);
  flex: none;
}

.tg-gutter-head {
  border-right: 1px solid var(--border-light);
}

.tg-allday-label {
  display: grid;
  place-items: center;
  font-size: 11px;
  color: var(--text-sub);
  border-right: 1px solid var(--border-light);
  padding: 4px 0;
}

.tg-head-cols,
.tg-allday-cols {
  flex: 1;
  display: grid;
  min-width: 0;
}

.tg-head-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 0;
  border-right: 1px solid var(--border-light);
}

.tg-head-cell:last-child {
  border-right: none;
}

.tg-head-cell .wd {
  font-size: 12px;
  color: var(--text-sub);
}

.tg-head-cell .dn {
  min-width: 26px;
  height: 26px;
  padding: 0 4px;
  border: none;
  border-radius: 13px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.tg-head-cell.today .dn {
  background: #409eff;
  color: #fff;
  font-weight: 600;
}

.tg-allday-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  min-height: 30px;
  border-right: 1px solid var(--border-light);
}

.tg-allday-col:last-child {
  border-right: none;
}

.tg-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.tg-hour {
  height: calc(var(--slot-h) * 2);
  position: relative;
  border-right: 1px solid var(--border-light);
}

.tg-hour span {
  position: absolute;
  top: -7px;
  right: 6px;
  font-size: 11px;
  color: var(--text-sub);
  background: var(--bg-panel);
  padding: 0 1px;
  font-variant-numeric: tabular-nums;
}

.tg-hour:first-child span {
  top: 2px;
}

.tg-cols {
  position: relative;
  flex: 1;
  display: grid;
  min-width: 0;
}

.tg-col {
  position: relative;
  border-right: 1px solid var(--border-light);
  cursor: cell;
}

.tg-col:last-child {
  border-right: none;
}

.tg-col.weekend {
  background: #fcfdff;
}

.tg-col.today {
  background: #fbfdff;
}

.tg-slot {
  height: var(--slot-h);
  border-bottom: 1px dashed #f0f2f5;
}

.tg-slot.hour {
  border-bottom: 1px solid var(--border-light);
}

.tg-event {
  position: absolute;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  line-height: 1.3;
  overflow: hidden;
  cursor: grab;
  user-select: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.tg-event.dragging {
  cursor: grabbing;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
  z-index: 10;
}

.tg-event.done {
  opacity: 0.55;
}

.tg-event.done .ev-title {
  text-decoration: line-through;
}

.tg-event.cancelled {
  opacity: 0.4;
}

.tg-event.cancelled .ev-title {
  text-decoration: line-through;
}

.tg-event.focused {
  outline: 2px solid #303133;
  outline-offset: -2px;
}

.ev-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ev-time {
  font-size: 11px;
  opacity: 0.9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ev-resize {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 7px;
  cursor: ns-resize;
}

.tg-now {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 2px solid #f56c6c;
  pointer-events: none;
  z-index: 5;
}

.tg-now::before {
  content: '';
  position: absolute;
  left: -4px;
  top: -5px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f56c6c;
}

@media (max-width: 900px) {
  .tg {
    --time-col-w: 44px;
  }

  .tg-head-cell {
    padding: 6px 0;
    gap: 4px;
  }

  .tg-event {
    padding: 1px 4px;
    font-size: 11px;
  }
}

@media (max-width: 640px) {
  .tg {
    --time-col-w: 38px;
  }

  /* 窄屏隐藏星期文字与事件结束时间，只留日期与标题 */
  .tg-head-cell .wd {
    display: none;
  }

  .tg-head-cell .dn {
    min-width: 22px;
    height: 22px;
    font-size: 12px;
  }

  .ev-time {
    display: none;
  }

  .tg-event {
    font-size: 10px;
    padding: 1px 3px;
  }

  .tg-hour span {
    font-size: 10px;
    right: 3px;
  }
}
</style>
