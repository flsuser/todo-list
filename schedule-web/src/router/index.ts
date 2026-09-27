import { createRouter, createWebHistory } from 'vue-router'
import { TOKEN_KEY } from '@/api'

declare module 'vue-router' {
  interface RouteMeta {
    /** 无需登录即可访问 */
    public?: boolean
    /** 浏览器标题前缀 */
    title?: string
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, title: '登录' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { public: true, title: '注册' },
    },
    {
      path: '/',
      component: () => import('@/views/AppLayout.vue'),
      children: [
        { path: '', redirect: '/calendar' },
        {
          path: 'calendar',
          name: 'calendar',
          component: () => import('@/views/CalendarView.vue'),
          meta: { title: '日历' },
        },
        {
          path: 'list',
          name: 'list',
          component: () => import('@/views/ListView.vue'),
          meta: { title: '列表' },
        },
        {
          path: 'board',
          name: 'board',
          component: () => import('@/views/BoardView.vue'),
          meta: { title: '看板' },
        },
        {
          path: 'inbox',
          name: 'inbox',
          component: () => import('@/views/InboxView.vue'),
          meta: { title: 'AI 识别' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
          meta: { title: '设置' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { public: true, title: '页面不存在' },
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const authed = Boolean(localStorage.getItem(TOKEN_KEY))

  if (!to.meta.public && !authed) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (authed && (to.path === '/login' || to.path === '/register')) {
    return { path: '/calendar' }
  }

  document.title = to.meta.title ? `${to.meta.title} · 日程规划` : '日程规划与提醒'
  return true
})

export default router
