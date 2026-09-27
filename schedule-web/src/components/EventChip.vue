<script setup lang="ts">
import { computed } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import type { EventItem } from '@/api/types'
import { chipStyle, eventColor } from '@/utils/color'
import { timeLabel } from '@/utils/time'

const props = defineProps<{
  item: EventItem
  /** 推送链接跳转过来时高亮该条 */
  focused?: boolean
  /** 紧凑模式：只显示标题，用于「+N 更多」弹层 */
  compact?: boolean
}>()

const color = computed(() => eventColor(props.item))
const stateClass = computed(() => ({
  done: props.item.status === 'done',
  cancelled: props.item.status === 'cancelled',
  focused: props.focused,
}))
</script>

<template>
  <div class="chip" :class="stateClass" :style="chipStyle(color)">
    <span v-if="!compact" class="chip-time">{{ timeLabel(item) }}</span>
    <span class="chip-title">{{ item.title }}</span>
    <el-icon v-if="item.isRecurring" class="chip-icon"><Refresh /></el-icon>
  </div>
</template>

<style scoped>
.chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-left: 3px solid transparent;
  border-radius: 3px;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  overflow: hidden;
  user-select: none;
}

.chip:hover {
  filter: brightness(0.97);
}

.chip-time {
  flex: none;
  font-variant-numeric: tabular-nums;
  color: #606266;
}

.chip-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-icon {
  flex: none;
  font-size: 11px;
  color: #909399;
}

.chip.done .chip-title {
  text-decoration: line-through;
  color: #909399;
}

.chip.cancelled {
  opacity: 0.5;
}

.chip.cancelled .chip-title {
  text-decoration: line-through;
}

.chip.focused {
  outline: 2px solid #409eff;
  outline-offset: -1px;
}
</style>
