import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class LinkProjectStudentDto {
  @IsString()
  beneficiary_id: string
}

export class CreateProjectClassDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome: string

  @IsInt()
  @Min(1)
  capacidade: number

  @IsOptional()
  @IsString()
  horario?: string
}

export class CreateProjectRoutineDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  titulo: string

  @IsOptional()
  @IsString()
  descricao?: string

  @IsOptional()
  @IsDateString()
  prazo?: string
}

class AttendanceEntryDto {
  @IsString()
  matricula_id: string

  @IsBoolean()
  presente: boolean
}

export class SaveProjectAttendanceDto {
  @IsDateString()
  data: string

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  presencas: AttendanceEntryDto[]
}
