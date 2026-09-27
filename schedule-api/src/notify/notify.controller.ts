import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { AuthUser, Page } from '../common/types'
import { PageQueryDto } from '../events/dto'
import { NotifyService } from './notify.service'

@ApiTags('notify')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notify')
export class NotifyController {
  constructor(private readonly notify: NotifyService) {}

  @Get('channels')
  @ApiOperation({ summary: '可用的推送渠道及其配置说明' })
  channels() {
    return this.notify.channels()
  }

  @Get('logs')
  @ApiOperation({ summary: '推送日志分页，失败记录含错误原因' })
  logs(@CurrentUser() user: AuthUser, @Query() q: PageQueryDto): Promise<Page<unknown>> {
    return this.notify.logs(user.id, q.page, q.limit)
  }
}
