import { z } from 'zod'

export const profiles = ['EMPRESA', 'OSC', 'ORGAO_PUBLICO', 'PESSOA_FISICA', 'OUTROS'] as const
export const kinds = [
  'OPORTUNIDADE',
  'AUTORIZACAO_CAPTACAO',
  'PROJETO_FINANCIADO',
  'HISTORICO_FINANCIADOR',
  'TRANSFERENCIA_PUBLICA',
  'PROGRAMA',
] as const
export const stages = [
  'IDENTIFICADA',
  'EM_ANALISE',
  'EM_PREPARACAO',
  'ENVIADA',
  'CONCLUIDA',
] as const
export const officialUrl = z
  .string()
  .url()
  .max(2000)
  .refine((v) => {
    const u = new URL(v)
    return u.protocol === 'https:' && !u.username && !u.password
  }, 'Use um link HTTPS oficial, sem credenciais.')

// Dates stay strings: a calendar date must never silently become a UTC timestamp.
export const sourceDate = z.string().refine((v) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v))
    return !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) &&
    !isNaN(Date.parse(v))
  )
}, 'Informe YYYY-MM-DD ou um instante ISO com fuso horário.')
export const requirementSchema = z
  .object({
    field: z.enum([
      'applicant_type',
      'uf',
      'city',
      'legal_nature',
      'themes',
      'age_years',
      'territorial_scope',
      'other',
    ]),
    operator: z.enum(['IN', 'MIN', 'TEXT']),
    value: z.union([
      z.array(z.string().max(500)).max(100),
      z.number().nonnegative(),
      z.string().max(5000),
    ]),
    evidence: z.string().min(1).max(10000),
  })
  .strict()
  .superRefine((r, ctx) => {
    const valid =
      r.field === 'age_years'
        ? r.operator === 'MIN' && typeof r.value === 'number'
        : r.field === 'other'
          ? r.operator === 'TEXT' && typeof r.value === 'string'
          : r.operator === 'IN' && Array.isArray(r.value) && r.value.length > 0
    if (!valid)
      ctx.addIssue({ code: 'custom', message: 'Operador ou valor incompatível com o requisito.' })
  })
export const manualSchema = z
  .object({
    source_id: z.enum(['FBB', 'PETROBRAS', 'ESPORTE', 'MANUAL']),
    external_id: z.string().min(1).max(200),
    source_url: officialUrl,
    application_url: officialUrl.nullable().optional(),
    kind: z.enum(kinds),
    title: z.string().min(1).max(1000),
    description: z.string().max(30000).nullable().optional(),
    theme: z.string().max(300).nullable().optional(),
    territories: z.array(z.string().max(100)).max(100).default([]),
    eligible_profiles: z.array(z.enum(profiles)).max(5).default([]),
    eligibility_text: z.string().max(10000).nullable().optional(),
    support_type: z.string().max(200).nullable().optional(),
    funder_name: z.string().max(300).nullable().optional(),
    amounts: z
      .array(
        z.object({
          meaning: z.string().min(1).max(200),
          amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
          currency: z.literal('BRL'),
        }),
      )
      .max(20)
      .default([]),
    dates: z
      .array(z.object({ meaning: z.string().max(200), value: sourceDate }))
      .max(20)
      .default([]),
    documents: z
      .array(z.object({ title: z.string().max(300), url: officialUrl }))
      .max(50)
      .default([]),
    starts_on: sourceDate.nullable().optional(),
    ends_on: sourceDate.nullable().optional(),
    timezone: z.string().max(100).nullable().optional(),
    official_status: z.string().max(500).nullable().optional(),
    availability_evidence: z.boolean().default(false),
    restricted: z.boolean().default(false),
    source_updated_at: sourceDate.nullable().optional(),
    requirements: z.array(requirementSchema).max(100).default([]),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.availability_evidence && (!r.official_status || !r.ends_on || !r.starts_on))
      ctx.addIssue({
        code: 'custom',
        message: 'Disponibilidade exige situação oficial e período expresso.',
      })
    if (
      r.starts_on &&
      r.ends_on &&
      ((r.starts_on.length === 10 && r.ends_on.length === 10 && r.starts_on > r.ends_on) ||
        (r.starts_on.length > 10 &&
          r.ends_on.length > 10 &&
          Date.parse(r.starts_on) > Date.parse(r.ends_on)))
    )
      ctx.addIssue({ code: 'custom', message: 'O prazo final precede o inicial.' })
    if ((r.starts_on?.length === 10 || r.ends_on?.length === 10) && r.timezone) {
      try {
        new Intl.DateTimeFormat('pt-BR', { timeZone: r.timezone })
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Fuso horário inválido.' })
      }
    }
  })
export type ManualInput = z.infer<typeof manualSchema>
export const organizationSchema = z
  .object({
    name: z.string().min(1).max(200),
    applicant_type: z.enum(profiles).nullable().default(null),
    legal_nature: z.string().max(300).nullable().default(null),
    uf: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .default(null),
    city: z.string().max(200).nullable().default(null),
    founded_on: sourceDate
      .refine((v) => v.length === 10)
      .nullable()
      .default(null),
    themes: z.array(z.string().max(100)).max(50).default([]),
    territorial_scope: z.string().max(200).nullable().default(null),
  })
  .strict()
export const querySchema = z.object({
  q: z.string().max(200).optional(),
  theme: z.string().max(200).optional(),
  territory: z.string().max(100).optional(),
  funder: z.string().max(200).optional(),
  support_type: z.string().max(200).optional(),
  profile: z.enum(profiles).optional(),
  kind: z.enum(kinds).optional(),
  source: z.string().max(100).optional(),
  view: z.enum(['available', 'catalog', 'history', 'fundraising', 'public']).default('available'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export const connectorSchema = z
  .object({
    enabled: z.boolean().optional(),
    interval_hours: z.number().int().min(1).max(720).optional(),
    page_size: z.number().int().min(1).max(200).optional(),
    max_pages: z.number().int().min(1).max(100).optional(),
  })
  .strict()
export const favoriteSchema = z
  .object({ stage: z.enum(stages), notes: z.string().max(5000).nullable().optional() })
  .strict()

export interface WindowRecord {
  kind: string
  availability_evidence: boolean
  restricted: boolean
  starts_on: string | null
  ends_on: string | null
  timezone: string | null
}
export function calendarDay(now: Date, zone = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
export function calculatedStatus(r: WindowRecord, now = new Date()) {
  if (['PROJETO_FINANCIADO', 'HISTORICO_FINANCIADOR'].includes(r.kind)) return 'HISTORICO'
  if (r.kind === 'TRANSFERENCIA_PUBLICA') return 'EXCLUSIVO_ORGAO_PUBLICO'
  if (!r.starts_on || !r.ends_on || !r.availability_evidence) return 'INFORMACOES_INSUFICIENTES'
  // Unspecified local timezone cannot support a precise date boundary decision.
  if ((r.starts_on.length === 10 || r.ends_on.length === 10) && !r.timezone)
    return 'INFORMACOES_INSUFICIENTES'
  const before =
    r.starts_on.length === 10
      ? calendarDay(now, r.timezone!) < r.starts_on
      : now.getTime() < Date.parse(r.starts_on)
  const after =
    r.ends_on.length === 10
      ? calendarDay(now, r.timezone!) > r.ends_on
      : now.getTime() > Date.parse(r.ends_on)
  if (after) return 'ENCERRADA'
  if (before) return 'EM_BREVE'
  return r.restricted
    ? 'ACESSO_RESTRITO'
    : r.kind === 'AUTORIZACAO_CAPTACAO'
      ? 'CAPTACAO_DISPONIVEL'
      : r.kind === 'OPORTUNIDADE'
        ? 'ABERTA'
        : 'INFORMACOES_INSUFICIENTES'
}

export function compatibility(
  profile: Record<string, any> | null,
  requirements: Array<{ field: string; operator: string; value: any; evidence: string }>,
  now = new Date(),
) {
  const checks = requirements.map((r) => {
    let used: unknown = profile?.[r.field]
    if (r.field === 'age_years' && profile?.founded_on) {
      const today = calendarDay(now)
      const founded = profile.founded_on as string
      used =
        Number(today.slice(0, 4)) -
        Number(founded.slice(0, 4)) -
        (today.slice(5) < founded.slice(5) ? 1 : 0)
    }
    let result = 'INSUFICIENTE'
    if (
      r.operator !== 'TEXT' &&
      used != null &&
      used !== '' &&
      !(Array.isArray(used) && !used.length)
    ) {
      if (r.operator === 'MIN' && typeof used === 'number' && typeof r.value === 'number')
        result = used >= r.value ? 'ATENDE' : 'NAO_ATENDE'
      if (r.operator === 'IN' && Array.isArray(r.value)) {
        const normalize = (v: unknown) =>
          String(v)
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
        result = (Array.isArray(used) ? used : [used]).some((v) =>
          r.value.map(normalize).includes(normalize(v)),
        )
          ? 'ATENDE'
          : 'NAO_ATENDE'
      }
    }
    return {
      field: r.field,
      requirement: r.value,
      evidence: r.evidence,
      used: used ?? null,
      result,
    }
  })
  return {
    status: checks.some((c) => c.result === 'NAO_ATENDE')
      ? 'INCOMPATIVEL'
      : !checks.length || checks.some((c) => c.result === 'INSUFICIENTE')
        ? 'INFORMACOES_INSUFICIENTES'
        : 'POTENCIALMENTE_COMPATIVEL',
    checks,
    notice:
      'Triagem baseada apenas nos requisitos expressos e nos dados cadastrados. Não garante habilitação ou aprovação.',
  }
}
