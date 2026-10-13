import { Type } from 'class-transformer'
import { IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'

export class SaveClassDto {
  @IsString() @MinLength(2) @MaxLength(120) nome: string
  @Type(() => Number) @IsInt() @Min(1) capacidade: number
  @IsOptional() @IsString() project_id?: string
}

export class UpdateClassDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) nome?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) capacidade?: number
}

export class ApplyEnrollmentDto {
  @IsString() turma_id: string
  @IsString() @MinLength(2) @MaxLength(200) aluno_nome: string
  @IsDateString() aluno_nascimento: string
  @IsOptional() @IsString() @MaxLength(20) aluno_cpf?: string
  @IsOptional() @IsString() @MaxLength(30) aluno_telefone?: string
  @IsOptional() @IsEmail() aluno_email?: string
  @IsIn(['RESPONSAVEL', 'PROFESSOR', 'ALUNO']) solicitante_tipo: 'RESPONSAVEL' | 'PROFESSOR' | 'ALUNO'
  @IsString() @MinLength(2) @MaxLength(200) solicitante_nome: string
  @IsString() @MinLength(5) @MaxLength(120) solicitante_contato: string
  @IsOptional() @IsIn(['PAI', 'MAE', 'AVO', 'TIO', 'TUTOR_LEGAL', 'OUTRO']) parentesco?: 'PAI' | 'MAE' | 'AVO' | 'TIO' | 'TUTOR_LEGAL' | 'OUTRO'
  @IsBoolean() consentimento: boolean
}
