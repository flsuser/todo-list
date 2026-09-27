import { User } from '@prisma/client'

/** 通用分页返回结构 */
export interface Page<T> {
  total: number
  items: T[]
}

/** JWT 令牌载荷 */
export interface JwtPayload {
  sub: number
  username: string
}

/**
 * 鉴权通过后挂到 request.user 的完整用户实体。
 * 守卫会顺带查库，因此这里能拿到 timezone / notifyChannel 等业务字段，
 * 控制器无需再单独查询用户。
 */
export type AuthUser = User & { sub: number }

/** 事件状态 */
export type EventStatus = 'todo' | 'doing' | 'done' | 'cancelled'

/** 事件优先级 */
export type EventPriority = 'low' | 'medium' | 'high' | 'urgent'

/** 提醒渠道 */
export type NotifyChannel = 'none' | 'serverchan' | 'dingtalk'
