import { config } from 'dotenv'

/**
 * 环境变量加载入口。
 * 必须在 main.ts / seed.ts 中作为「第一条」import 引入，
 * 保证 JwtModule 等在模块定义阶段读取 process.env 时配置已就绪。
 * 生产容器内由 docker-compose 注入环境变量，找不到 .env 时静默跳过。
 */
config()
