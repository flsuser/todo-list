import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class RegisterDto {
  @ApiProperty({ example: 'zhangsan', description: '登录用户名，3-30 位字母数字下划线' })
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @Matches(/^[a-zA-Z0-9_]{3,30}$/, { message: '用户名为 3-30 位字母、数字或下划线' })
  username: string

  @ApiProperty({ example: 'zhangsan@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(120)
  email: string

  @ApiProperty({ example: 'password123', description: '6-100 位' })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(100, { message: '密码最多 100 位' })
  password: string

  @ApiProperty({ example: '张三', required: false })
  @IsString()
  @MaxLength(30)
  @IsNotEmpty({ message: '昵称不能为空' })
  nickname?: string
}

export class LoginDto {
  @ApiProperty({ example: 'zhangsan', description: '用户名或邮箱' })
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @MaxLength(120)
  username: string

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MaxLength(100)
  password: string
}
