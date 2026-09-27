import { createPinia } from 'pinia'
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'
import router from './router'
import 'element-plus/dist/index.css'
import './styles/main.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
// 统一中文文案（日期选择器、分页等）
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')
