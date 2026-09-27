// 必须最先加载 .env，后续模块在定义阶段就要读环境变量
import './env'

import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  app.setGlobalPrefix('api')
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 剔除 DTO 未声明的字段
      transform: true, // 查询参数自动转换为 DTO 类型
    }),
  )
  app.useGlobalFilters(new AllExceptionsFilter())
  app.enableCors({ origin: true })

  // Swagger 仅在开发环境暴露：http://localhost:3001/api/docs
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('日程规划与提醒 API')
      .setDescription('schedule-api 接口文档')
      .addBearerAuth()
      .build()
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config))
  }

  const port = Number(process.env.PORT ?? 3001)
  await app.listen(port, '0.0.0.0')
  console.log(`schedule-api running at http://localhost:${port}/api`)
}

bootstrap()
