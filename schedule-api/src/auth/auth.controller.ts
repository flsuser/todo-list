import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { LoginDto, RegisterDto } from './dto'

@ApiTags('auth')
// 注册/登录接口收紧限流，避免撞库与刷号
@Throttle({ default: { ttl: 60_000, limit: 10 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: '注册新用户（自动创建默认清单并下发令牌）' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto)
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '登录（用户名或邮箱）' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto)
  }
}
