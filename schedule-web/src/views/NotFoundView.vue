<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="notfound">
    <div class="code">404</div>
    <p class="muted">页面走丢了，它可能已被移动或删除</p>
    <el-button type="primary" @click="router.replace('/calendar')">回到日历</el-button>
  </div>
</template>

<style scoped>
.notfound {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 14px;
  min-height: 100%;
  padding: 40px 20px;
}

.code {
  font-size: 72px;
  font-weight: 700;
  color: #c8c9cc;
  line-height: 1;
}
</style>
