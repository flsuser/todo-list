<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import EventDialog from '@/components/EventDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useEventsStore } from '@/stores/events'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const store = useEventsStore()
const ui = useUiStore()

/** 站内提醒条轮询间隔 */
const POLL_MS = 60_000
let timer: number | undefined

onMounted(async () => {
  // 刷新页面后凭 token 恢复资料；失败则守卫会拦回登录页
  if (!auth.profile) await auth.fetchMe()
  await Promise.all([store.loadLists(), store.loadUpcoming(60)])
  timer = window.setInterval(() => store.loadUpcoming(60), POLL_MS)

  // 推送消息里的链接带 focus=<id>，进来后让日历定位高亮
  const focus = Number(route.query.focus)
  if (Number.isFinite(focus) && focus > 0) ui.setFocus(focus)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

// 移动端：切换路由后自动收起抽屉，避免遮住新页面
watch(
  () => route.fullPath,
  () => ui.closeMobileNav(),
)

async function onLogout() {
  auth.logout()
  store.clear()
  await router.push('/login')
}
</script>

<template>
  <div class="layout">
    <AppHeader @logout="onLogout" />
    <div class="layout-body">
      <AppSidebar />
      <!-- 移动端抽屉展开时的遮罩，点击收起 -->
      <div v-if="ui.isMobile && ui.mobileNavOpen" class="nav-mask" @click="ui.closeMobileNav()" />
      <main class="layout-main thin-scroll">
        <router-view />
      </main>
    </div>
    <!-- 全局共用一个编辑弹窗，任意视图都能通过 ui store 打开 -->
    <EventDialog />
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.layout-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.layout-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}

.nav-mask {
  position: fixed;
  top: var(--header-h);
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  background: rgba(0, 0, 0, 0.35);
}
</style>
