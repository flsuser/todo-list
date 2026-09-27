import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { AuthUser } from '../common/types'
import { NotifyService } from '../notify/notify.service'
import { ChangePasswordDto, UpdateAiDto, UpdateNotifyDto, UpdateProfileDto } from './dto'
import { UsersService } from './users.service'

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly notify: NotifyService,
  ) {}

  @Get()
  @ApiOperation({ summary: '当前登录用户信息' })
  me(@CurrentUser() user: AuthUser) {
    return this.users.profile(user)
  }

  @Get('stats')
  @ApiOperation({ summary: '概览统计：日程数、今日待办、已逾期、AI 用量' })
  stats(@CurrentUser() user: AuthUser) {
    return this.users.stats(user)
  }

  @Get('timezones')
  @ApiOperation({ summary: '可选时区列表' })
  timezones() {
    return this.users.timezones()
  }

  @Patch()
  @ApiOperation({ summary: '修改昵称 / 邮箱 / 时区' })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user, dto)
  }

  @Patch('password')
  @ApiOperation({ summary: '修改密码' })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(user, dto)
  }

  @Patch('notify')
  @ApiOperation({ summary: '保存提醒推送渠道与凭证' })
  updateNotify(@CurrentUser() user: AuthUser, @Body() dto: UpdateNotifyDto) {
    return this.users.updateNotify(user, dto)
  }

  @Patch('ai')
  @ApiOperation({ summary: '保存自填的 DeepSeek API Key 与视觉模型（Key 加密存储）' })
  updateAi(@CurrentUser() user: AuthUser, @Body() dto: UpdateAiDto) {
    return this.users.updateAi(user, dto)
  }

  @Post('notify-test')
  @HttpCode(200)
  @ApiOperation({ summary: '发送一条测试推送，验证渠道配置' })
  async notifyTest(@CurrentUser() user: AuthUser) {
    await this.notify.sendTest(user)
    return { ok: true }
  }
}
