import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, NICKNAME_KEY, TOKEN_KEY } from '@/api'
import type { UserProfile } from '@/api/types'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const nickname = ref<string>(localStorage.getItem(NICKNAME_KEY) ?? '')
  /** 完整用户资料，登录后或刷新页面时从 /users/me 拉取 */
  const profile = ref<UserProfile | null>(null)

  const isLoggedIn = computed(() => Boolean(token.value))
  const timezone = computed(() => profile.value?.timezone ?? 'Asia/Shanghai')

  function persist(accessToken: string, user: UserProfile) {
    token.value = accessToken
    profile.value = user
    nickname.value = user.nickname
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(NICKNAME_KEY, user.nickname)
  }

  async function login(username: string, password: string) {
    const res = await api.login(username, password)
    persist(res.accessToken, res.user)
    return res.user
  }

  async function register(data: {
    username: string
    email: string
    password: string
    nickname?: string
  }) {
    const res = await api.register(data)
    persist(res.accessToken, res.user)
    return res.user
  }

  /** 页面刷新后凭 token 恢复资料；失败说明令牌已失效 */
  async function fetchMe() {
    if (!token.value) return null
    try {
      const user = await api.me()
      profile.value = user
      nickname.value = user.nickname
      localStorage.setItem(NICKNAME_KEY, user.nickname)
      return user
    } catch {
      return null
    }
  }

  /** 资料被设置页修改后同步到本地 */
  function setProfile(user: UserProfile) {
    profile.value = user
    nickname.value = user.nickname
    localStorage.setItem(NICKNAME_KEY, user.nickname)
  }

  function logout() {
    token.value = null
    profile.value = null
    nickname.value = ''
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(NICKNAME_KEY)
  }

  return {
    token,
    nickname,
    profile,
    isLoggedIn,
    timezone,
    login,
    register,
    fetchMe,
    setProfile,
    logout,
  }
})
