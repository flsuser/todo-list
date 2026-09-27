import 'express'
import { AuthUser } from '../common/types'

declare module 'express' {
  interface Request {
    /** JWT 鉴权通过后由 JwtAuthGuard 附加的完整用户实体 */
    user?: AuthUser
  }
}
