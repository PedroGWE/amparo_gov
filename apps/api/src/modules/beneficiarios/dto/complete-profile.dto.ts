import { IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'
import { Type } from 'class-transformer'
import { Gender, ParentescoType } from '@prisma/client'

export class CompleteProfileDto {
  @IsString() @MinLength(2) @MaxLength(200) name: string
  @IsOptional() @IsString() cpf?: string
  @IsOptional() @IsDateString() birth_date?: string
  @IsOptional() @IsEnum(Gender) gender?: Gender
  @IsOptional() @IsString() telefone?: string
  @IsOptional() @IsEmail() email?: string
  @IsOptional() @IsString() rg_certidao?: string
  @IsOptional() @IsString() @MaxLength(8) cep?: string
  @IsOptional() @IsString() logradouro?: string
  @IsOptional() @IsString() numero?: string
  @IsOptional() @IsString() complemento?: string
  @IsOptional() @IsString() bairro?: string
  @IsOptional() @IsString() cidade?: string
  @IsOptional() @IsString() @MaxLength(2) uf_endereco?: string
  @IsOptional() @IsString() escola?: string
  @IsOptional() @IsString() serie_ano?: string
  @IsOptional() @IsString() necessidades_especiais?: string
  @IsOptional() @IsString() alergias?: string
  @IsOptional() @IsString() medicamentos?: string
  @IsOptional() @IsString() observacoes_gerais?: string
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) renda_familiar?: number
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) pessoas_residencia?: number
  @IsOptional() @IsString() @MinLength(2) responsavel_nome?: string
  @IsOptional() @IsEnum(ParentescoType) responsavel_parentesco?: ParentescoType
  @IsOptional() @IsString() responsavel_cpf?: string
  @IsOptional() @IsString() responsavel_telefone?: string
  @IsOptional() @IsEmail() responsavel_email?: string
  @IsBoolean() termo_consentimento: boolean
  @IsBoolean() autorizacao_uso_imagem: boolean
}
