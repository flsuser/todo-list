import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { ServeStaticModule } from '@nestjs/serve-static'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AiModule } from './ai/ai.module'
import { AuthModule } from './auth/auth.module'
import { TMP_DIR } from './common/config'
import { EventsModule } from './events/events.module'
import { ListsModule } from './lists/lists.module'
import { NotifyModule } from './notify/notify.module'
import { PrismaModule } from './prisma/prisma.module'
import { UploadModule } from './upload/upload.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    // 定时任务：提醒推送（每分钟）与临时图片清理（每天）
    ScheduleModule.forRoot(),
    // 全局限流；/auth 与 /ai 在各自控制器上另设更严的阈值
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    // 开发环境由 NestJS 托管 AI 上传的临时图片（生产同样直连 3001，不落 nginx 静态卷）
    ServeStaticModule.forRoot({
      rootPath: TMP_DIR,
      serveRoot: '/tmp',
      serveStaticOptions: { index: false, redirect: false },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ListsModule,
    EventsModule,
    AiModule,
    NotifyModule,
    UploadModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
