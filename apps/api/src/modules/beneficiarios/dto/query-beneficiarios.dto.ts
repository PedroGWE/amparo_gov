import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { BeneficiaryStatus } from '@prisma/client'

export class QueryBeneficiariosDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsEnum(BeneficiaryStatus)
  status?: BeneficiaryStatus

  @IsOptional()
  @IsString()
  project_id?: string

  @IsOptional()
  @IsString()
  curso_id?: string

  @IsOptional()
  @IsString()
  turma?: string

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
