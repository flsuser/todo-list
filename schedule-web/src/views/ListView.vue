<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import TimelineList from '@/components/list/TimelineList.vue'
import { api } from '@/api'
import type { EventGroup, EventItem } from '@/api/types'
import { useEventsStore } from '@/stores/events'
import { useUiStore } from '@/stores/ui'
import { PRIORITY_OPTIONS } from '@/utils/color'

const route = useRoute()
const store = useEventsStore()
const ui = useUiStore()

const loading = ref(false)
const total = ref(0)
const groups = ref<Partial<Record<EventGroup, EventItem[]>>>({})

const filters = reactive({
  listId: undefined as number | undefined,
  priority: '',
  /** 与看板视图共用同一个关键词，切换视图时筛选条件不丢 */
  keyword: ui.searchKeyword,
})

let debounceTimer: number | undefined

async function load() {
  loading.value = true
  try {
    const res = await api.eventsList({
      listId: filters.listId,
      priority: filters.priority || undefined,
      keyword: filters.keyword.trim() || undefined,
    })
    groups.value = res.groups ?? {}
    total.value = res.total
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

/** 关键词是逐字输入的，做 300ms 去抖；下拉筛选则立即生效 */
watch(
  () => filters.keyword,
  (value) => {
    ui.searchKeyword = value
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(load, 300)
  },
)

watch([() => filters.listId, () => filters.priority], load)

watch(
  () => route.query.list,
  (raw) => {
    filters.listId = typeof raw === 'string' && raw ? Number(raw) : undefined
  },
)

// 编辑弹窗关闭后刷新，保证列表与弹窗里的改动一致
watch(
  () => ui.dialogVisible,
  (visible, prev) => {
    if (prev && !visible) load()
  },
)

async function onToggle(item: EventItem) {
  try {
    await store.toggleDone(item)
    await load()
  } catch {
    // 拦截器已提示
  }
}

async function onRemove(item: EventItem) {
  const label = item.isRecurring ? '整个重复日程' : '该日程'
  try {
    await ElMessageBox.confirm(`确定删除「${item.title}」吗？${label}将被移除。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  try {
    await store.removeEvent(item)
    ElMessage.success('已删除')
    await load()
  } catch {
    // 拦截器已提示
  }
}

function resetFilters() {
  filters.listId = undefined
  filters.priority = ''
  filters.keyword = ''
}

onMounted(() => {
  const raw = route.query.list
  if (typeof raw === 'string' && raw) filters.listId = Number(raw)
  load()
})
</script>

<template>
  <div class="page">
    <div class="toolbar panel">
      <div class="toolbar-left">
        <h2 class="title">日程列表</h2>
        <span class="muted">共 {{ total }} 条</span>
      </div>

      <div class="toolbar-right">
        <el-input
          v-model="filters.keyword"
          placeholder="搜索标题、地点或备注"
          :prefix-icon="Search"
          clearable
          style="width: 220px"
        />
        <el-select
          v-model="filters.listId"
          placeholder="全部清单"
          clearable
          style="width: 130px"
        >
          <el-option
            v-for="opt in store.listOptions"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
          />
        </el-select>
        <el-select v-model="filters.priority" placeholder="全部优先级" clearable style="width: 130px">
          <el-option
            v-for="opt in PRIORITY_OPTIONS"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
          />
        </el-select>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button link @click="resetFilters">重置</el-button>
        <el-button type="primary" :icon="Plus" @click="ui.openCreate()">新建日程</el-button>
      </div>
    </div>

    <div v-loading="loading">
      <TimelineList
        :groups="groups"
        :total="total"
        @open="ui.openEdit"
        @toggle="onToggle"
        @remove="onRemove"
      />
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
  margin-bottom: 14px;
}

.toolbar-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
