import { IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { Gender } from '@prisma/client'

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
  @IsBoolean() termo_consentimento: boolean
  @IsBoolean() autorizacao_uso_imagem: boolean
}
