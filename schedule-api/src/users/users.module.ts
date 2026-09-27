import { Module } from '@nestjs/common'
import { NotifyModule } from '../notify/notify.module'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  imports: [NotifyModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
