import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { Prisma, User } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { endOfDayInTz, safeTimezone, startOfDayInTz } from '../common/utils/time'
import { encryptSecret } from '../common/utils/secret'
import { toPublicUser } from '../common/utils/serialize'
import { PrismaService } from '../prisma/prisma.service'
import { ChangePasswordDto, UpdateAiDto, UpdateNotifyDto, UpdateProfileDto } from './dto'

dayjs.extend(utc)
dayjs.extend(timezone)

/** 常用时区，供设置页下拉选择 */
export const TIMEZONE_OPTIONS = [
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
]

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async profile(user: User) {
    return toPublicUser(user)
  }

  async updateProfile(user: User, dto: UpdateProfileDto) {
    const data: Prisma.UserUpdateInput = {}

    if (dto.nickname !== undefined) {
      const nickname = dto.nickname.trim()
      if (!nickname) throw new BadRequestException('昵称不能为空')
      data.nickname = nickname
    }
    if (dto.email !== undefined) {
      data.email = dto.email.trim().toLowerCase()
    }
    if (dto.timezone !== undefined) {
      const tz = safeTimezone(dto.timezone)
      // safeTimezone 对非法值会静默回退，这里显式报错，避免用户以为改成功了
      if (tz !== dto.timezone) throw new BadRequestException('时区名称不正确，请使用 IANA 时区名，例如 Asia/Shanghai')
      data.timezone = tz
    }

    try {
      const updated = await this.prisma.user.update({ where: { id: user.id }, data })
      return toPublicUser(updated)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('该邮箱已被其他账号使用')
      }
      throw e
    }
  }

  async changePassword(user: User, dto: ChangePasswordDto) {
    const matched = await bcrypt.compare(dto.oldPassword, user.passwordHash)
    if (!matched) throw new BadRequestException('当前密码不正确')
    if (dto.oldPassword === dto.newPassword) throw new BadRequestException('新密码不能与当前密码相同')

    const passwordHash = await bcrypt.hash(dto.newPassword, 10)
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } })
    return { ok: true }
  }

  /**
   * 保存推送配置。
   * token 留空且已有配置时沿用原值（便于只调整提前分钟数）；
   * 钉钉的 webhook 与加签密钥以 `url|secret` 形式合并存储。
   */
  async updateNotify(user: User, dto: UpdateNotifyDto) {
    const data: Prisma.UserUpdateInput = { notifyChannel: dto.channel }
    if (dto.notifyBefore !== undefined) data.notifyBefore = dto.notifyBefore

    if (dto.channel === 'none') {
      data.notifyToken = null
    } else {
      const token = dto.token?.trim()
      const secret = dto.secret?.trim() ?? ''
      if (token) {
        data.notifyToken = dto.channel === 'dingtalk' ? `${token}|${secret}` : token
      } else if (!user.notifyToken) {
        throw new BadRequestException(
          dto.channel === 'dingtalk' ? '请填写钉钉机器人 Webhook 地址' : '请填写 Server酱 SendKey',
        )
      } else if (dto.channel === 'dingtalk' && dto.secret !== undefined) {
        // 只改加签密钥，Webhook 地址沿用原值
        const [url] = user.notifyToken.split('|')
        data.notifyToken = `${url}|${secret}`
      }
    }

    const updated = await this.prisma.user.update({ where: { id: user.id }, data })
    return toPublicUser(updated)
  }

  /**
   * 保存用户自填的 DeepSeek 配置（Key 加密落库）。
   * apiKey 留空 = 保持不变；null = 清除；非空 = 覆盖。
   */
  async updateAi(user: User, dto: UpdateAiDto) {
    const data: Prisma.UserUpdateInput = {}

    if (dto.apiKey === null) {
      data.deepseekKey = null
    } else if (dto.apiKey !== undefined) {
      const key = dto.apiKey.trim()
      if (key) {
        if (!/^[A-Za-z0-9_.-]{20,200}$/.test(key)) {
          throw new BadRequestException('DeepSeek API Key 格式不正确：应为 20-200 位且不含空格或中文')
        }
        data.deepseekKey = encryptSecret(key)
      }
    }

    if (dto.visionModel !== undefined) {
      data.deepseekVisionModel = dto.visionModel?.trim() || null
    }

    if (dto.model !== undefined) {
      const model = dto.model?.trim() || ''
      if (model && !/^[A-Za-z0-9_.:-]{2,100}$/.test(model)) {
        throw new BadRequestException('模型名格式不正确：仅允许字母、数字与 . _ - : 字符')
      }
      data.deepseekModel = model || null
    }

    if (Object.keys(data).length === 0) {
      return toPublicUser(user)
    }
    const updated = await this.prisma.user.update({ where: { id: user.id }, data })
    return toPublicUser(updated)
  }

  /** 概览数据：设置页与首页展示 */
  async stats(user: User) {
    const tz = safeTimezone(user.timezone)
    const now = new Date()
    const dayStart = startOfDayInTz(now, tz)
    const dayEnd = endOfDayInTz(now, tz)
    const monthStart = dayjs(now).tz(tz).startOf('month').toDate()

    const [events, todayTodo, overdue, lists, batches] = await this.prisma.$transaction([
      this.prisma.event.count({ where: { userId: user.id, status: { notIn: ['cancelled'] } } }),
      this.prisma.event.count({
        where: {
          userId: user.id,
          status: { in: ['todo', 'doing'] },
          startAt: { gte: dayStart, lte: dayEnd },
        },
      }),
      this.prisma.event.count({
        where: { userId: user.id, status: { in: ['todo', 'doing'] }, startAt: { lt: now } },
      }),
      this.prisma.eventList.count({ where: { userId: user.id } }),
      this.prisma.aiParseBatch.findMany({
        where: { userId: user.id, createdAt: { gte: monthStart } },
        select: { usage: true },
      }),
    ])

    let promptTokens = 0
    let completionTokens = 0
    for (const b of batches) {
      const usage = b.usage as { promptTokens?: number; completionTokens?: number } | null
      promptTokens += usage?.promptTokens ?? 0
      completionTokens += usage?.completionTokens ?? 0
    }

    return {
      events,
      todayTodo,
      overdue,
      lists,
      ai: { batches: batches.length, promptTokens, completionTokens },
    }
  }

  timezones() {
    return TIMEZONE_OPTIONS
  }
}
