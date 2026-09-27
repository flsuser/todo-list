import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { AuthUser } from '../types'

/** 取出 JwtAuthGuard 校验后的当前登录用户（含时区、推送配置等） */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest()
    return request.user as AuthUser
  },
)
