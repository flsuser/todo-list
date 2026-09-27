import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Request } from 'express'
import { JwtPayload } from '../common/types'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('未登录或缺少令牌')
    }

    let payload: JwtPayload
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(header.slice('Bearer '.length))
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录')
    }

    // 顺带查库：账号被删除时令牌立即失效，同时把时区等字段带给后续业务
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) throw new UnauthorizedException('账号不存在或已被删除')

    request.user = { ...user, sub: user.id }
    return true
  }
}
