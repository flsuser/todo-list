import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

/**
 * 入库敏感凭证的对称加解密（当前仅用于用户自填的 DeepSeek Key）。
 * 密钥由 JWT_SECRET 派生：更换 JWT_SECRET 会使旧密文解不开（decryptSecret 返回 null），
 * 用户重新填一次 Key 即可，不会报错崩溃。
 */
const PREFIX = 'enc:v1:'

let derived: Buffer | null = null
function key(): Buffer {
  if (!derived) {
    derived = scryptSync(process.env.JWT_SECRET ?? 'dev-secret-change-me', 'schedule-api-secret', 32)
  }
  return derived
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `${PREFIX}${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ct.toString('base64')}`
}

/** 解密；入参为空返回 null，格式不符（历史明文/密钥已换）时也返回 null 而非抛错 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!stored.startsWith(PREFIX)) return stored
  try {
    const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split('.')
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** 展示用掩码：只保留头 3 位与尾 4 位 */
export function maskSecret(plain: string | null): string | null {
  if (!plain) return null
  if (plain.length <= 10) return '****'
  return `${plain.slice(0, 3)}****${plain.slice(-4)}`
}
