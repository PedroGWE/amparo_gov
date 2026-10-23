import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator'
import { Transform, Type } from 'class-transformer'
import { ProjectStatus, ProjectType } from '@prisma/client'

export class QueryProjectsDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  include_legacy?: boolean

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus

  @IsOptional()
  @IsEnum(ProjectType)
  type?: ProjectType

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20
}
