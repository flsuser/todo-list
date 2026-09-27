import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Prisma, User } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { JwtService } from '@nestjs/jwt'
import { toPublicUser } from '../common/utils/serialize'
import { PrismaService } from '../prisma/prisma.service'
import { LoginDto, RegisterDto } from './dto'

/** 新用户注册时自动创建的默认清单 */
const DEFAULT_LISTS: { name: string; color: string; sortOrder: number }[] = [
  { name: '收件箱', color: '#909399', sortOrder: 0 },
  { name: '工作', color: '#409EFF', sortOrder: 1 },
  { name: '生活', color: '#67C23A', sortOrder: 2 },
]

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** 注册：建用户 + 默认清单，成功后直接下发令牌，免去二次登录 */
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase()
    const passwordHash = await bcrypt.hash(dto.password, 10)

    try {
      const user = await this.prisma.user.create({
        data: {
          username: dto.username,
          email,
          passwordHash,
          nickname: dto.nickname?.trim() || dto.username,
          lists: { create: DEFAULT_LISTS },
        },
      })
      return this.sign(user)
    } catch (e) {
      throw this.uniqueError(e)
    }
  }

  /** 登录：支持用户名或邮箱 */
  async login(dto: LoginDto) {
    const account = dto.username.trim()
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: account }, { email: account.toLowerCase() }] },
    })
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('账号或密码错误')
    }
    return this.sign(user)
  }

  /** 签发 7 天有效的 JWT，并回传脱敏后的用户信息 */
  private sign(user: User) {
    const accessToken = this.jwt.sign({ sub: user.id, username: user.username })
    return { accessToken, user: toPublicUser(user) }
  }

  private uniqueError(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const field = (e.meta?.target as string[] | undefined)?.[0]
      throw new ConflictException(field === 'email' ? '该邮箱已被注册' : '该用户名已被占用')
    }
    throw e
  }
}
