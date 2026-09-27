import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5175,
    proxy: {
      // 开发环境下转发到本地 schedule-api（默认 3001 端口）
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      // AI 识别上传的临时图片由 schedule-api 托管
      '/tmp': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: {
    // AI 解析可能耗时较长，上传接口单独放宽超时（axios 侧另配）
    chunkSizeWarningLimit: 1200,
  },
})
