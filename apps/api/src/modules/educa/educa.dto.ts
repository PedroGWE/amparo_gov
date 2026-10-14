import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
export class AccountDto {
  @IsIn(['aluno', 'professor']) perfil: 'aluno' | 'professor'
  @IsString() @MinLength(1) registro_id: string
  @IsOptional() @IsEmail() email?: string
  @IsOptional() @Matches(/^[A-Za-z0-9-]{3,30}$/) matricula?: string
  @IsString() @MinLength(8) @MaxLength(100) senha: string
}
export class ClassDto {
  @IsString() @MinLength(2) @MaxLength(150) nome: string
  @IsString() professor_id: string
  @IsOptional() @IsString() project_id?: string
}
export class EnrollmentDto {
  @IsString() aluno_id: string
}
export class LessonDto {
  @IsString() @MinLength(2) @MaxLength(200) titulo: string
  @IsISO8601() inicio: string
  @IsISO8601() fim: string
  @Matches(/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/) meet_url: string
}
export class AttendanceEntry {
  @IsString() matricula_id: string
  @IsIn(['PRESENTE', 'AUSENTE', 'JUSTIFICADA']) status: string
}
export class AttendanceDto {
  @IsInt() @Min(0) versao: number
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntry)
  itens: AttendanceEntry[]
}
export class MaterialDto {
  @IsString() @MinLength(2) @MaxLength(200) titulo: string
  @IsOptional() @IsString() @MaxLength(20000) texto?: string
  @IsOptional() @IsString() anexo_id?: string
}
export class ActivityDto {
  @IsString() @MinLength(2) @MaxLength(200) titulo: string
  @IsString() @MaxLength(20000) descricao: string
  @IsOptional() @IsISO8601() prazo?: string
}
export class SubmissionDto {
  @IsString() @MaxLength(20000) conteudo: string
  @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) anexos: string[]
}
export class GradeDto {
  @IsOptional() @Type(() => Number) @Min(0) @Max(10) nota?: number
  @IsString() @MaxLength(5000) feedback: string
}
