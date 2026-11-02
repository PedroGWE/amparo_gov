import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator'

export class InstrumentDto {
  @IsString() project_id: string
  @IsString() @MinLength(1) number: string
  @IsOptional() @IsString() kind?: string
  @IsOptional() @IsString() grantor_sphere?: string
  @IsOptional() @IsString() grantor?: string
  @IsOptional() @IsString() work_plan_document_id?: string
}
export class OpenMonthDto {
  @IsString() instrument_id: string
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month: string
}
export class RequirementDto {
  @IsIn(['PENDENTE', 'EM_PREPARACAO', 'AGUARDANDO_ASSINATURA', 'EM_REVISAO', 'VALIDADO', 'DISPENSADO']) status: string
  @IsOptional() @IsBoolean() applies?: boolean
  @IsOptional() @IsString() justification?: string
  @IsOptional() @IsArray() @IsString({ each: true }) evidence_ids?: string[]
}
export class RuleDto {
  @IsString() code: string
  @IsString() kind: string
  @IsString() title: string
  @IsOptional() @IsString() description?: string
  @IsIn(['ANEXO_OBSERVADO', 'INSTRUMENTO_CONFIRMADO', 'CONTROLE_RECOMENDADO', 'NAO_CONFIRMADO']) origin: string
  @IsOptional() @IsString() source_reference?: string
  @IsBoolean() applies: boolean
  @IsBoolean() blocks_close: boolean
  @IsOptional() @IsInt() @Min(1) @Max(31) due_day?: number
}
export class TeamDto {
  @IsString() instrument_id: string
  @IsOptional() @IsString() professor_id?: string
  @IsString() name: string
  @IsString() role: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() internal_registration?: string
  @IsOptional() @IsString() cpf?: string
  @IsOptional() @IsString() cnpj?: string
  @IsDateString() valid_from: string
  @IsOptional() @IsDateString() valid_until?: string
  @IsOptional() @IsInt() @Min(0) weekly_minutes?: number
  @IsOptional() @IsString() contracted_unit?: string
  @IsOptional() @IsString() quantity?: string
  @IsOptional() @IsString() amount?: string
  @IsOptional() @IsString() contract_document_id?: string
}
export class PointDto {
  @IsString() team_link_id: string
  @IsDateString() start_at: string
  @IsOptional() @IsDateString() end_at?: string
  @IsIn(['REALIZADO', 'PLANEJADO', 'AFASTAMENTO', 'AJUSTE']) kind: string
  @IsOptional() @IsString() justification?: string
}
export class CloseDto { @IsOptional() @IsString() reason?: string }
export class ProtocolDto {
  @IsString() @MinLength(3) number: string
  @IsString() portal: string
  @IsDateString() submitted_at: string
  @IsOptional() @IsString() evidence_id?: string
}
export class ExecutionDto {
  @IsString() activities: string
  @IsString() results: string
  @IsString() deviations: string
  @IsString() justifications: string
  @IsArray() @IsString({ each: true }) source_ids: string[]
}
