import { Module } from '@nestjs/common'
import { EventsModule } from '../events/events.module'
import { DingTalkAdapter } from './adapters/dingtalk.adapter'
import { ServerChanAdapter } from './adapters/serverchan.adapter'
import { NotifyController } from './notify.controller'
import { NotifyService } from './notify.service'
import { ReminderJob } from './reminder.job'

// 依赖 EventsModule 导出的 OccurrenceService：提醒前需先物化重复日程的实例
@Module({
  imports: [EventsModule],
  controllers: [NotifyController],
  providers: [NotifyService, ServerChanAdapter, DingTalkAdapter, ReminderJob],
  exports: [NotifyService],
})
export class NotifyModule {}
