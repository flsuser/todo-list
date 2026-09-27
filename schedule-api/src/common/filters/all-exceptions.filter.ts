import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Response } from 'express'

/** 统一错误响应体为 { statusCode, message }，避免 500 泄漏堆栈 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception')

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR
    let message: string | string[] = '服务器内部错误'

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus()
      const res = exception.getResponse()
      if (typeof res === 'string') {
        message = res
      } else if (res && typeof res === 'object') {
        const body = res as { message?: string | string[] }
        message = body.message ?? exception.message
      }
    } else if (exception instanceof Error) {
      message = exception.message
    }

    if (statusCode >= 500) {
      this.logger.error(message, exception instanceof Error ? exception.stack : undefined)
    }

    response.status(statusCode).json({ statusCode, message })
  }
}
