import { z } from 'zod'

export const BENEFICIARY_STATUSES = ['ATIVO', 'INATIVO', 'SUSPENSO', 'EGRESSO'] as const
export type BeneficiaryStatus = (typeof BENEFICIARY_STATUSES)[number]

export const GENDERS = ['MASCULINO', 'FEMININO', 'NAO_BINARIO', 'PREFIRO_NAO_INFORMAR', 'OUTRO'] as const
export type Gender = (typeof GENDERS)[number]

export const PARENTESCO_TYPES = ['PAI', 'MAE', 'AVO', 'TIO', 'TUTOR_LEGAL', 'OUTRO'] as const
export type ParentescoType = (typeof PARENTESCO_TYPES)[number]

export const VINCULO_STATUSES = ['ATIVO', 'INATIVO', 'DESLIGADO', 'EM_ESPERA'] as const
export type VinculoStatus = (typeof VINCULO_STATUSES)[number]

export const BENEFICIARY_STATUS_LABELS: Record<BeneficiaryStatus, string> = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
  SUSPENSO: 'Suspenso',
  EGRESSO: 'Egresso',
}

export const GENDER_LABELS: Record<Gender, string> = {
  MASCULINO: 'Masculino',
  FEMININO: 'Feminino',
  NAO_BINARIO: 'Não-binário',
  PREFIRO_NAO_INFORMAR: 'Prefiro não informar',
  OUTRO: 'Outro',
}

export const PARENTESCO_LABELS: Record<ParentescoType, string> = {
  PAI: 'Pai',
  MAE: 'Mãe',
  AVO: 'Avô/Avó',
  TIO: 'Tio/Tia',
  TUTOR_LEGAL: 'Tutor Legal',
  OUTRO: 'Outro',
}

export const createBeneficiarioSchema = z.object({
  name: z.string().min(2).max(200),
  cpf: z.string().optional().nullable(),
  birth_date: z.preprocess((value) => value === '' ? null : value, z.string().optional().nullable()),
  gender: z.preprocess((value) => value === '' ? null : value, z.enum(GENDERS).optional().nullable()),
  telefone: z.string().optional().nullable(),
  email: z.preprocess((value) => value === '' ? null : value, z.string().email('E-mail inválido').optional().nullable()),
  rg_certidao: z.string().optional().nullable(),
  cep: z.string().max(8).optional().nullable(),
  logradouro: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  complemento: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  uf_endereco: z.string().max(2).optional().nullable(),
  turma: z.string().optional().nullable(),
  turno: z.string().optional().nullable(),
  escola: z.string().optional().nullable(),
  serie_ano: z.string().optional().nullable(),
  necessidades_especiais: z.string().optional().nullable(),
  alergias: z.string().optional().nullable(),
  medicamentos: z.string().optional().nullable(),
  observacoes_gerais: z.string().optional().nullable(),
  termo_consentimento: z.boolean().default(false),
  data_consentimento: z.preprocess((value) => value === '' ? null : value, z.string().optional().nullable()),
  autorizacao_uso_imagem: z.boolean().default(false),
  status: z.enum(BENEFICIARY_STATUSES).default('ATIVO'),
  project_id: z.preprocess((value) => value === '' ? null : value, z.string().optional().nullable()),
})
export type CreateBeneficiarioInput = z.infer<typeof createBeneficiarioSchema>

export const createResponsavelSchema = z.object({
  nome_completo: z.string().min(2).max(200),
  parentesco: z.enum(PARENTESCO_TYPES),
  cpf: z.string().optional().nullable(),
  telefone: z.string().optional().nullable(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('').transform(() => undefined)),
})
export type CreateResponsavelInput = z.infer<typeof createResponsavelSchema>

export const createVinculoSchema = z.object({
  project_id: z.string().min(1, 'Selecione um projeto'),
  data_ingresso: z.string().min(1, 'Data de ingresso obrigatória'),
  data_desligamento: z.string().optional().nullable(),
  status: z.enum(VINCULO_STATUSES).default('ATIVO'),
  turma: z.string().optional().nullable(),
  turno: z.string().optional().nullable(),
})
export type CreateVinculoInput = z.infer<typeof createVinculoSchema>
