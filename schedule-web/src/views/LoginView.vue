<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({ username: '', password: '' })

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名或邮箱', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const user = await auth.login(form.username.trim(), form.password)
    ElMessage.success(`欢迎回来，${user.nickname}`)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/calendar'
    await router.replace(redirect)
  } catch {
    // 账号密码错误等提示已由响应拦截器弹出
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card panel">
      <div class="auth-head">
        <span class="brand-mark">日</span>
        <h1>日程规划与提醒</h1>
        <p class="muted">登录后管理你的日程、待办与提醒</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent="submit">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名或邮箱" clearable />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            show-password
            @keyup.enter="submit"
          />
        </el-form-item>
        <el-button type="primary" class="submit" :loading="loading" @click="submit">
          登录
        </el-button>
      </el-form>

      <div class="auth-foot muted">
        还没有账号？
        <router-link to="/register" class="link">立即注册</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  display: grid;
  place-items: center;
  min-height: 100%;
  padding: 24px;
  background: linear-gradient(160deg, #eef4ff 0%, #f5f7fa 55%, #eefaf3 100%);
}

.auth-card {
  width: 100%;
  max-width: 380px;
  padding: 32px 28px 24px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.06);
}

.auth-head {
  text-align: center;
  margin-bottom: 24px;
}

.auth-head h1 {
  margin: 12px 0 6px;
  font-size: 20px;
}

.auth-head p {
  margin: 0;
  font-size: 13px;
}

.brand-mark {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: #409eff;
  color: #fff;
  font-size: 20px;
  font-weight: 700;
}

.submit {
  width: 100%;
}

.auth-foot {
  margin-top: 18px;
  text-align: center;
  font-size: 13px;
}

.link {
  color: #409eff;
}
</style>
