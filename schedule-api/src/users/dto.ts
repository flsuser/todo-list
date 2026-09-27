import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: '张三' })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  nickname?: string

  @ApiPropertyOptional({ example: 'zhangsan@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(120)
  @IsOptional()
  email?: string

  @ApiPropertyOptional({ example: 'Asia/Shanghai', description: 'IANA 时区名' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  timezone?: string
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: '请输入当前密码' })
  @MaxLength(100)
  oldPassword: string

  @ApiProperty({ description: '6-100 位' })
  @IsString()
  @MinLength(6, { message: '新密码至少 6 位' })
  @MaxLength(100)
  newPassword: string
}

export class UpdateNotifyDto {
  @ApiProperty({ enum: ['none', 'serverchan', 'dingtalk'] })
  @IsIn(['none', 'serverchan', 'dingtalk'], { message: '推送渠道取值不正确' })
  channel: string

  @ApiPropertyOptional({
    description: 'Server酱3 填 SendKey；钉钉填群机器人 Webhook 地址',
  })
  @IsString()
  @MaxLength(600)
  @IsOptional()
  token?: string

  @ApiPropertyOptional({ description: '钉钉机器人加签密钥（SEC 开头），未开启加签可留空' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  secret?: string

  @ApiPropertyOptional({ default: 15, description: '默认提前提醒分钟数' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  @IsOptional()
  notifyBefore?: number
}

/**
 * 用户自填的 DeepSeek 配置。
 * 语义：字段缺省/空串 = 保持不变；null = 清除；非空 = 覆盖。
 * （visionModel 的空串也视为清除，因为「仅文字识别」本身就是一个合法取值）
 */
export class UpdateAiDto {
  @ApiPropertyOptional({ description: 'DeepSeek API Key；留空保持不变，传 null 清除' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'API Key 过长' })
  apiKey?: string | null

  @ApiPropertyOptional({
    description: '视觉模型名（如 deepseek-v4-flash-vision-exp）；留空或 null 表示仅文字识别',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  visionModel?: string | null

  @ApiPropertyOptional({
    description: '文本识别模型名（如 deepseek-chat / deepseek-reasoner）；留空或 null 回退服务器默认',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string | null
}
