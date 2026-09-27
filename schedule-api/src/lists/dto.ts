import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export class CreateListDto {
  @ApiProperty({ example: '工作' })
  @IsString()
  @IsNotEmpty({ message: '清单名称不能为空' })
  @MaxLength(30, { message: '清单名称最多 30 字' })
  name: string

  @ApiPropertyOptional({ example: '#409EFF', default: '#409EFF' })
  @IsString()
  @Matches(HEX_COLOR, { message: '颜色需为 #RGB 或 #RRGGBB 格式' })
  @IsOptional()
  color?: string
}

export class UpdateListDto extends CreateListDto {}

export class SortListDto {
  @ApiProperty({ type: [Number], description: '按新顺序排列的清单 id' })
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Type(() => Number)
  ids: number[]
}
