import { User } from '@prisma/client'
import { decryptSecret, maskSecret } from './secret'

/** 对外返回的用户信息：剔除密码哈希与推送密钥明文 */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nickname: user.nickname,
    timezone: user.timezone,
    notifyChannel: user.notifyChannel,
    // 只告诉前端「是否已配置」，密钥本身不回传
    notifyConfigured: Boolean(user.notifyToken),
    notifyBefore: user.notifyBefore,
    // AI Key 同样只回传掩码与配置状态
    aiKeyConfigured: Boolean(user.deepseekKey),
    aiKeyMask: maskSecret(decryptSecret(user.deepseekKey)),
    aiModel: user.deepseekModel,
    aiVisionModel: user.deepseekVisionModel,
    createdAt: user.createdAt,
  }
}

export type PublicUser = ReturnType<typeof toPublicUser>
