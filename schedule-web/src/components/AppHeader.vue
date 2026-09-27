<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Bell, Expand, Fold, Plus, User } from '@element-plus/icons-vue'
import QuickAddBar from '@/components/QuickAddBar.vue'
import { useAuthStore } from '@/stores/auth'
import { useEventsStore } from '@/stores/events'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const emit = defineEmits<{ (e: 'logout'): void }>()

const router = useRouter()
const auth = useAuthStore()
const store = useEventsStore()
const settings = useSettingsStore()
const ui = useUiStore()

const collapsed = computed(() => settings.prefs.sidebarCollapsed)

/** 移动端按钮控制抽屉，宽屏控制侧栏折叠 */
function onToggleNav() {
  if (ui.isMobile) ui.toggleMobileNav()
  else settings.toggle('sidebarCollapsed')
}

const navOpen = computed(() => (ui.isMobile ? ui.mobileNavOpen : collapsed.value))

async function onCommand(command: string) {
  if (command === 'settings') {
    router.push('/settings')
    return
  }
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确定退出登录吗？', '提示', {
        type: 'warning',
        confirmButtonText: '退出',
        cancelButtonText: '取消',
      })
    } catch {
      return
    }
    emit('logout')
  }
}
</script>

<template>
  <header class="header">
    <div class="header-left">
      <el-button link class="collapse-btn" @click="onToggleNav">
        <el-icon :size="18">
          <Expand v-if="!navOpen" />
          <Fold v-else />
        </el-icon>
      </el-button>
      <router-link to="/calendar" class="brand">
        <span class="brand-mark">日</span>
        <span class="brand-text">日程规划</span>
      </router-link>
    </div>

    <div v-if="!ui.isMobile" class="header-center">
      <QuickAddBar />
    </div>

    <div class="header-right">
      <el-tooltip content="新建日程" placement="bottom">
        <el-button type="primary" :icon="Plus" class="new-btn" @click="ui.openCreate()">新建</el-button>
      </el-tooltip>

      <el-tooltip
        :content="store.upcoming.length ? '有日程即将开始' : '暂无即将开始的日程'"
        placement="bottom"
      >
        <el-badge :value="store.upcoming.length" :hidden="!store.upcoming.length" :max="9">
          <el-button link class="icon-btn" @click="router.push('/list')">
            <el-icon :size="18"><Bell /></el-icon>
          </el-button>
        </el-badge>
      </el-tooltip>

      <el-dropdown @command="onCommand">
        <span class="user-trigger">
          <el-avatar :size="26" :icon="User" />
          <span class="nickname">{{ auth.nickname || '未登录' }}</span>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="settings">账号与提醒设置</el-dropdown-item>
            <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>

<style scoped>
.header {
  height: var(--header-h);
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-light);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.collapse-btn {
  padding: 6px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: #409eff;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.brand-text {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
}

.header-center {
  flex: 1;
  min-width: 0;
  max-width: 620px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: none;
}

.icon-btn {
  padding: 4px;
}

.user-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  outline: none;
}

.nickname {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

@media (max-width: 900px) {
  .brand-text,
  .nickname {
    display: none;
  }

  .header {
    gap: 8px;
    padding: 0 10px;
  }

  .header-right {
    gap: 8px;
    margin-left: auto;
  }
}

@media (max-width: 640px) {
  /* 窄屏新建按钮只留图标；span 在 ElButton 内部，需 :deep 才命中 */
  .new-btn :deep(span) {
    display: none;
  }
}
</style>
