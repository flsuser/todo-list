<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({ username: '', email: '', nickname: '', password: '', confirm: '' })

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]{3,30}$/, message: '3-30 位字母、数字或下划线', trigger: 'blur' },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 100, message: '密码长度 6-100 位', trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) =>
        value === form.password ? callback() : callback(new Error('两次输入的密码不一致')),
      trigger: 'blur',
    },
  ],
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const user = await auth.register({
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      nickname: form.nickname.trim() || undefined,
    })
    ElMessage.success(`注册成功，欢迎 ${user.nickname}`)
    await router.replace('/calendar')
  } catch {
    // 用户名/邮箱重复等提示已由响应拦截器弹出
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
        <h1>创建账号</h1>
        <p class="muted">注册后即可使用 AI 图文识别与到期推送</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="3-30 位字母、数字或下划线" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="用于登录，可随时在设置中修改" />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="form.nickname" placeholder="留空则使用用户名" maxlength="30" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirm">
          <el-input
            v-model="form.confirm"
            type="password"
            show-password
            placeholder="再输入一次"
            @keyup.enter="submit"
          />
        </el-form-item>
        <el-button type="primary" class="submit" :loading="loading" @click="submit">
          注册并登录
        </el-button>
      </el-form>

      <div class="auth-foot muted">
        已有账号？
        <router-link to="/login" class="link">返回登录</router-link>
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
  max-width: 420px;
  padding: 28px 28px 22px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.06);
}

.auth-head {
  text-align: center;
  margin-bottom: 18px;
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
  margin-top: 16px;
  text-align: center;
  font-size: 13px;
}

.link {
  color: #409eff;
}
</style>
