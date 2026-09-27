<script setup lang="ts">
import { ref } from 'vue'
import { Delete, Edit, Refresh } from '@element-plus/icons-vue'
import type { EventGroup, EventItem } from '@/api/types'
import { dayjs, fromNowLabel, fullTimeLabel } from '@/utils/time'

defineProps<{
  groups: Partial<Record<EventGroup, EventItem[]>>
  total?: number
}>()

const emit = defineEmits<{
  (e: 'open', item: EventItem): void
  (e: 'toggle', item: EventItem): void
  (e: 'remove', item: EventItem): void
}>()

const GROUPS: { key: EventGroup; label: string; tone: string; collapsible?: boolean }[] = [
  { key: 'overdue', label: '已过期', tone: 'danger' },
  { key: 'today', label: '今天', tone: 'primary' },
  { key: 'tomorrow', label: '明天', tone: 'warning' },
  { key: 'week', label: '本周', tone: '' },
  { key: 'later', label: '以后', tone: '' },
  { key: 'done', label: '已完成', tone: 'muted', collapsible: true },
]

/** 已完成分组默认折叠，避免历史数据把待办挤到屏幕外 */
const collapsed = ref<Record<string, boolean>>({ done: true })

function toggleGroup(key: string) {
  collapsed.value[key] = !collapsed.value[key]
}

function relative(item: EventItem): string {
  if (item.allDay) return dayjs(item.startAt).format('M 月 D 日')
  return `${dayjs(item.startAt).format('M 月 D 日 HH:mm')} · ${fromNowLabel(item.startAt)}`
}
</script>

<template>
  <div class="timeline">
    <section
      v-for="g in GROUPS"
      :key="g.key"
      class="group"
      :class="{ empty: !(groups[g.key]?.length ?? 0) }"
    >
      <header class="group-head" @click="g.collapsible && toggleGroup(g.key)">
        <span class="group-label" :class="g.tone">{{ g.label }}</span>
        <span class="group-count">{{ groups[g.key]?.length ?? 0 }}</span>
        <el-icon v-if="g.collapsible" class="group-arrow" :class="{ up: !collapsed[g.key] }">
          <svg viewBox="0 0 16 16" width="12" height="12">
            <path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" />
          </svg>
        </el-icon>
      </header>

      <div v-if="!collapsed[g.key]" class="group-body">
        <p v-if="!(groups[g.key]?.length ?? 0)" class="muted group-empty">暂无日程</p>

        <article
          v-for="item in groups[g.key] ?? []"
          :key="`${item.id}-${item.occurrenceId}`"
          class="row"
          :class="{ done: item.status === 'done' }"
        >
          <el-checkbox
            :model-value="item.status === 'done'"
            class="row-check"
            @change="emit('toggle', item)"
          />

          <span class="prio-dot" :class="`prio-${item.priority}`" />

          <div class="row-main" @click="emit('open', item)">
            <div class="row-title">
              {{ item.title }}
              <el-icon v-if="item.isRecurring" class="row-icon" :title="item.rruleText">
                <Refresh />
              </el-icon>
              <el-tag v-if="item.priority === 'urgent'" size="small" type="danger" effect="plain">
                紧急
              </el-tag>
            </div>
            <div class="row-meta muted">
              <span>{{ relative(item) }}</span>
              <span v-if="item.location">· {{ item.location }}</span>
              <span v-if="item.rruleText">· {{ item.rruleText }}</span>
            </div>
          </div>

          <el-tag v-if="item.list" size="small" effect="plain" :color="undefined">
            <span class="tag-inner">
              <i class="prio-dot" :style="{ background: item.list.color }" />
              {{ item.list.name }}
            </span>
          </el-tag>

          <div class="row-actions">
            <span class="muted time-full">{{ fullTimeLabel(item) }}</span>
            <el-tooltip content="编辑" placement="top">
              <el-button link :icon="Edit" @click="emit('open', item)" />
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button link :icon="Delete" @click="emit('remove', item)" />
            </el-tooltip>
          </div>
        </article>
      </div>
    </section>

    <p v-if="!total" class="empty-tip">当前筛选条件下没有任何日程，点右上角「新建日程」开始规划</p>
  </div>
</template>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.group {
  background: var(--bg-panel);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow: hidden;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #fafafa;
  border-bottom: 1px solid var(--border-light);
  cursor: default;
}

.group-label {
  font-size: 13px;
  font-weight: 600;
}

.group-label.danger {
  color: #f56c6c;
}
.group-label.primary {
  color: #409eff;
}
.group-label.warning {
  color: #e6a23c;
}
.group-label.muted {
  color: var(--text-sub);
}

.group-count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: #eef0f3;
  color: var(--text-sub);
  font-size: 11px;
  text-align: center;
}

.group-arrow {
  margin-left: auto;
  color: var(--text-sub);
  transition: transform 0.15s;
}

.group-arrow.up {
  transform: rotate(180deg);
}

.group-body {
  padding: 4px 0;
}

.group-empty {
  margin: 0;
  padding: 12px 14px;
  font-size: 13px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  border-bottom: 1px solid #f5f6f8;
}

.row:last-child {
  border-bottom: none;
}

.row:hover {
  background: #fafcff;
}

.row-check {
  flex: none;
  height: auto;
}

.row-main {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.row-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row.done .row-title {
  color: var(--text-sub);
  text-decoration: line-through;
}

.row-icon {
  font-size: 12px;
  color: var(--text-sub);
}

.row-meta {
  margin-top: 2px;
  font-size: 12px;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tag-inner {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.time-full {
  display: none;
  font-size: 12px;
  white-space: nowrap;
}

@media (min-width: 1280px) {
  .time-full {
    display: inline;
  }
}

@media (max-width: 640px) {
  .row {
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 10px;
  }

  .row-main {
    flex: 1 1 60%;
  }

  .row-actions {
    margin-left: auto;
  }
}

@media (max-width: 480px) {
  /* 超窄屏隐藏清单标签，保证标题与操作按钮不被挤出去 */
  .row > .el-tag {
    display: none;
  }
}
</style>
