<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft, ArrowRight, Plus } from '@element-plus/icons-vue'
import type { CalendarMode } from '@/stores/settings'
import type { Dayjs } from '@/utils/time'
import { rangeTitle } from '@/utils/time'

const props = defineProps<{ mode: CalendarMode; date: Dayjs }>()

const emit = defineEmits<{
  (e: 'update:mode', value: CalendarMode): void
  (e: 'shift', step: number): void
  (e: 'today'): void
  (e: 'pick', value: string): void
  (e: 'create'): void
}>()

const title = computed(() => rangeTitle(props.date, props.mode))

const MODES: { value: CalendarMode; label: string }[] = [
  { value: 'month', label: '月' },
  { value: 'week', label: '周' },
  { value: 'day', label: '日' },
]

/** el-date-picker 直接绑定到当前日期，选完即跳转 */
const picker = computed({
  get: () => props.date.format('YYYY-MM-DD'),
  set: (value: string) => value && emit('pick', value),
})
</script>

<template>
  <div class="toolbar">
    <div class="toolbar-left">
      <el-button @click="emit('today')">今天</el-button>
      <el-button-group class="pager">
        <el-button :icon="ArrowLeft" @click="emit('shift', -1)" />
        <el-button :icon="ArrowRight" @click="emit('shift', 1)" />
      </el-button-group>
      <h2 class="title">{{ title }}</h2>
    </div>

    <div class="toolbar-right">
      <el-date-picker
        v-model="picker"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="跳转到日期"
        :clearable="false"
        style="width: 148px"
      />
      <el-radio-group
        :model-value="mode"
        @update:model-value="emit('update:mode', $event as CalendarMode)"
      >
        <el-radio-button v-for="m in MODES" :key="m.value" :value="m.value">
          {{ m.label }}
        </el-radio-button>
      </el-radio-group>
      <el-button type="primary" :icon="Plus" class="create-btn" @click="emit('create')">新建日程</el-button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
  background: var(--bg-panel);
  border: 1px solid var(--border-light);
  border-radius: 8px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pager {
  margin-left: 2px;
}

.title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .toolbar {
    padding: 10px 12px;
    gap: 8px;
  }

  .toolbar-left,
  .toolbar-right {
    gap: 6px;
  }

  .title {
    font-size: 15px;
  }
}

@media (max-width: 640px) {
  /* 窄屏：日期选择器收窄、新建只留图标，保证一行放得下 */
  .toolbar :deep(.el-date-editor) {
    width: 128px !important;
  }

  .create-btn :deep(span) {
    display: none;
  }

  .title {
    font-size: 14px;
  }
}
</style>
