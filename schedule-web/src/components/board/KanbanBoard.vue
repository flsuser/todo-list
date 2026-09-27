<script setup lang="ts">
import { ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import type { BoardResponse, EventItem, EventStatus } from '@/api/types'
import { BOARD_COLUMNS, eventColor, withAlpha } from '@/utils/color'
import { dayjs, timeLabel } from '@/utils/time'

defineProps<{ board: BoardResponse }>()

const emit = defineEmits<{
  (e: 'open', item: EventItem): void
  (e: 'change', item: EventItem, status: EventStatus): void
}>()

const dragItem = ref<EventItem | null>(null)
const overColumn = ref<EventStatus | null>(null)

function onDragStart(item: EventItem, e: DragEvent) {
  dragItem.value = item
  overColumn.value = null
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // Firefox 需要显式 setData 才会触发拖拽
    e.dataTransfer.setData('text/plain', String(item.id))
  }
}

function onDragEnter(status: EventStatus, e: DragEvent) {
  e.preventDefault()
  overColumn.value = status
}

/** 只有在本列内部移动时才取消高亮，避免子元素边界抢触发 */
function onDragLeave(status: EventStatus) {
  if (overColumn.value === status) overColumn.value = null
}

function onDrop(status: EventStatus, e: DragEvent) {
  e.preventDefault()
  const item = dragItem.value
  dragItem.value = null
  overColumn.value = null
  if (!item || item.status === status) return
  emit('change', item, status)
}

function onDragEnd() {
  dragItem.value = null
  overColumn.value = null
}

function cardStyle(item: EventItem) {
  const color = eventColor(item)
  return { borderLeftColor: color, background: withAlpha(color, 0.05) }
}
</script>

<template>
  <div class="board">
    <section
      v-for="col in BOARD_COLUMNS"
      :key="col.status"
      class="column"
      :class="{ 'drop-active': overColumn === col.status }"
      @dragover.prevent
      @dragenter="onDragEnter(col.status, $event)"
      @dragleave="onDragLeave(col.status)"
      @drop="onDrop(col.status, $event)"
    >
      <header class="column-head">
        <span class="column-title">{{ col.label }}</span>
        <span class="column-count">{{ board[col.status].length }}</span>
      </header>

      <div class="column-body thin-scroll">
        <p v-if="!board[col.status].length" class="muted column-empty">
          拖动卡片到这里
        </p>

        <article
          v-for="item in board[col.status]"
          :key="`${item.id}-${item.occurrenceId}`"
          class="card"
          :class="{ dragging: dragItem?.id === item.id, done: item.status === 'done' }"
          :style="cardStyle(item)"
          draggable="true"
          @dragstart="onDragStart(item, $event)"
          @dragend="onDragEnd"
          @click="emit('open', item)"
        >
          <div class="card-title">
            {{ item.title }}
            <el-icon v-if="item.isRecurring" class="card-icon"><Refresh /></el-icon>
          </div>

          <div class="card-meta muted">
            <span class="prio-dot" :class="`prio-${item.priority}`" />
            <span>{{ item.allDay ? dayjs(item.startAt).format('M月D日 全天') : `${dayjs(item.startAt).format('M月D日')} ${timeLabel(item)}` }}</span>
          </div>

          <div v-if="item.location" class="card-meta muted">
            <span class="dot-placeholder" />
            <span class="ellipsis">{{ item.location }}</span>
          </div>

          <footer v-if="item.list" class="card-foot">
            <span class="list-tag" :style="{ background: withAlpha(item.list.color, 0.16), color: item.list.color }">
              {{ item.list.name }}
            </span>
          </footer>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}

.column {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - var(--header-h) - 150px);
  background: #f7f8fa;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  transition: background 0.15s;
}

.column-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
  flex: none;
}

.column-title {
  font-size: 13px;
  font-weight: 600;
}

.column-count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: #e6e8eb;
  color: var(--text-sub);
  font-size: 11px;
  text-align: center;
}

.column-body {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.column-empty {
  margin: 0;
  padding: 24px 0;
  text-align: center;
  font-size: 12px;
}

.card {
  padding: 9px 11px;
  background: var(--bg-panel);
  border: 1px solid var(--border-light);
  border-left: 3px solid transparent;
  border-radius: 6px;
  cursor: grab;
  transition: box-shadow 0.15s;
}

.card:hover {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}

.card.done .card-title {
  color: var(--text-sub);
  text-decoration: line-through;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  word-break: break-word;
}

.card-icon {
  flex: none;
  font-size: 12px;
  color: var(--text-sub);
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  font-size: 12px;
}

.dot-placeholder {
  width: 8px;
  flex: none;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-foot {
  margin-top: 7px;
}

.list-tag {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 9px;
  font-size: 11px;
}

@media (max-width: 900px) {
  .board {
    grid-template-columns: 1fr;
  }

  .column {
    max-height: none;
  }
}
</style>
