<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EventItem } from '@/api/types'
import EventChip from '@/components/EventChip.vue'
import { startPointerDrag } from '@/utils/drag'
import type { Dayjs } from '@/utils/time'
import { dayjs, isToday, WEEK_LABELS } from '@/utils/time'

const props = defineProps<{
  rows: Dayjs[][]
  current: Dayjs
  items: EventItem[]
  focusId?: number | null
}>()

const emit = defineEmits<{
  (e: 'create', preset: { start: string; allDay: boolean }): void
  (e: 'open', item: EventItem): void
  (e: 'move', item: EventItem, start: Dayjs): void
  (e: 'show-day', date: Dayjs): void
}>()

/** 每格最多直接展示几条，其余折叠到「更多」 */
const MAX_VISIBLE = 3

const moreKey = ref<string | null>(null)
const highlightKey = ref<string | null>(null)

/** 跨天日程要在覆盖到的每一天都出现，因此按天展开建索引 */
const byDay = computed(() => {
  const map = new Map<string, EventItem[]>()
  for (const it of props.items) {
    const start = dayjs(it.startAt).startOf('day')
    const end = it.endAt ? dayjs(it.endAt).startOf('day') : start
    const span = Math.min(Math.max(end.diff(start, 'day'), 0), 30)
    for (let i = 0; i <= span; i++) {
      const key = start.add(i, 'day').format('YYYY-MM-DD')
      const arr = map.get(key)
      if (arr) arr.push(it)
      else map.set(key, [it])
    }
  }
  for (const arr of map.values()) {
    // 全天事件置顶，其余按开始时间升序
    arr.sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        dayjs(a.startAt).valueOf() - dayjs(b.startAt).valueOf(),
    )
  }
  return map
})

const visibleOf = (key: string) => (byDay.value.get(key) ?? []).slice(0, MAX_VISIBLE)
const hiddenOf = (key: string) => (byDay.value.get(key) ?? []).slice(MAX_VISIBLE)
const keyOf = (date: Dayjs) => date.format('YYYY-MM-DD')

/** 展开/收起某一天的「更多」面板 */
function toggleMore(date: Dayjs) {
  const key = keyOf(date)
  moreKey.value = moreKey.value === key ? null : key
}

function openFromMore(item: EventItem) {
  moreKey.value = null
  emit('open', item)
}

function onCellClick(date: Dayjs, e: MouseEvent) {
  const target = e.target as HTMLElement
  // 点在色块或「更多」上时不触发新建
  if (target.closest('.chip') || target.closest('.more-btn')) return
  moreKey.value = null
  emit('create', {
    start: date.hour(9).minute(0).second(0).millisecond(0).format(),
    allDay: false,
  })
}

/** 拖动色块换日期：命中哪个格子由 elementFromPoint 决定，保留原来的时刻 */
function onChipPointerDown(item: EventItem, e: PointerEvent) {
  if (e.button !== 0) return
  const originKey = dayjs(item.startAt).format('YYYY-MM-DD')
  let targetKey = originKey

  startPointerDrag(e, {
    onMove: (_dx, _dy, ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const cell = el?.closest<HTMLElement>('[data-date]')
      if (cell?.dataset.date) targetKey = cell.dataset.date
      highlightKey.value = targetKey
    },
    onEnd: (_ev, moved) => {
      highlightKey.value = null
      if (!moved) {
        emit('open', item)
        return
      }
      if (targetKey === originKey) return
      const origin = dayjs(item.startAt)
      const next = dayjs(`${targetKey}T00:00:00`)
        .hour(origin.hour())
        .minute(origin.minute())
        .second(0)
        .millisecond(0)
      emit('move', item, next)
    },
  })
}
</script>

<template>
  <div class="month">
    <div class="month-week">
      <div v-for="w in WEEK_LABELS" :key="w" class="month-week-cell">{{ w }}</div>
    </div>

    <div class="month-body" @click="moreKey = null">
      <div v-for="(row, ri) in rows" :key="ri" class="month-row">
        <div
          v-for="date in row"
          :key="keyOf(date)"
          class="month-cell"
          :data-date="keyOf(date)"
          :class="{
            other: !date.isSame(current, 'month'),
            weekend: date.day() === 0 || date.day() === 6,
            'drop-target': highlightKey === keyOf(date),
          }"
          @click="onCellClick(date, $event)"
        >
          <div class="cell-head">
            <button
              class="cell-date"
              :class="{ today: isToday(date) }"
              @dblclick="emit('show-day', date)"
            >
              {{ date.date() }}
            </button>
          </div>

          <div class="cell-items">
            <EventChip
              v-for="it in visibleOf(keyOf(date))"
              :key="`${it.id}-${it.occurrenceId}`"
              :item="it"
              :focused="focusId === it.id"
              @click.stop="emit('open', it)"
              @pointerdown="onChipPointerDown(it, $event)"
            />
            <button
              v-if="hiddenOf(keyOf(date)).length"
              class="more-btn"
              @click.stop="toggleMore(date)"
            >
              +{{ hiddenOf(keyOf(date)).length }} 更多
            </button>
          </div>

          <div v-if="moreKey === keyOf(date)" class="more-panel panel" @click.stop>
            <div class="more-head">{{ date.format('M 月 D 日') }}</div>
            <EventChip
              v-for="it in byDay.get(keyOf(date)) ?? []"
              :key="`more-${it.id}-${it.occurrenceId}`"
              :item="it"
              compact
              @click.stop="openFromMore(it)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.month {
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow: hidden;
}

.month-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--border-light);
  background: #fafafa;
}

.month-week-cell {
  padding: 8px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-sub);
}

.month-body {
  display: grid;
  grid-template-rows: repeat(6, minmax(104px, 1fr));
}

.month-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.month-row:not(:last-child) {
  border-bottom: 1px solid var(--border-light);
}

.month-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 4px 5px 6px;
  cursor: pointer;
  transition: background 0.12s;
}

.month-cell:not(:last-child) {
  border-right: 1px solid var(--border-light);
}

.month-cell.other {
  background: #fcfcfd;
}

.month-cell.other .cell-date {
  color: #c8c9cc;
}

.month-cell.weekend:not(.other) {
  background: #fcfdff;
}

.month-cell.drop-target {
  background: #ecf5ff;
  box-shadow: inset 0 0 0 1px #409eff;
}

.cell-head {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 2px;
}

.cell-date {
  min-width: 22px;
  height: 22px;
  padding: 0 4px;
  border: none;
  border-radius: 11px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.cell-date.today {
  background: #409eff;
  color: #fff;
  font-weight: 600;
}

.cell-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
}

.more-btn {
  align-self: flex-start;
  padding: 0 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-sub);
}

.more-btn:hover {
  color: #409eff;
}

.more-panel {
  position: absolute;
  z-index: 20;
  top: 24px;
  left: 4px;
  width: 210px;
  max-height: 220px;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  cursor: default;
}

.more-head {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 2px;
}

@media (max-width: 900px) {
  .month-body {
    grid-template-rows: repeat(6, minmax(84px, 1fr));
  }

  .month-cell {
    padding: 3px 3px 4px;
  }

  .month-week-cell {
    padding: 6px 0;
    font-size: 11px;
  }
}

@media (max-width: 640px) {
  .month-body {
    grid-template-rows: repeat(6, minmax(68px, 1fr));
  }

  .cell-date {
    min-width: 18px;
    height: 18px;
    padding: 0 3px;
    font-size: 11px;
    border-radius: 9px;
  }

  /* 色块在窄屏压缩成细条，只留单行截断文字 */
  .cell-items :deep(.chip) {
    padding: 0 4px;
    font-size: 10px;
    line-height: 16px;
  }

  .more-btn {
    font-size: 10px;
  }

  .more-panel {
    left: 2px;
    width: min(220px, calc(100vw - 28px));
  }
}
</style>
