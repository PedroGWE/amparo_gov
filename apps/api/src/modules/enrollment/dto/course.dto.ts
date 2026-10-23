import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator'

export class SaveCourseDto {
  @IsString() @MinLength(2) @MaxLength(120) nome: string
  @IsIn(['CURSO', 'MODALIDADE']) tipo: 'CURSO' | 'MODALIDADE'
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(5000) descricao?: string
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() ativo?: boolean
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() inscricoes_abertas?: boolean
  @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsString({ each: true }) project_ids?: string[]
  @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsString({ each: true }) emenda_ids?: string[]
  @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsString({ each: true }) edital_ids?: string[]
}

export class BatchClassesDto {
  @IsString() @MinLength(2) @MaxLength(100) nome: string
  @Type(() => Number) @IsInt() @Min(1) @Max(50) quantidade: number
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) capacidade: number
  @ValidateIf((_object, value) => value !== undefined) @IsString() project_id?: string
}
