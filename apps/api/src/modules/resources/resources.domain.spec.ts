import {
  calculatedStatus,
  compatibility,
  manualSchema,
  sourceDate,
  organizationSchema,
} from './resources.domain'

const now = new Date('2026-10-29T15:00:00Z')
const open = {
  kind: 'OPORTUNIDADE',
  availability_evidence: true,
  restricted: false,
  starts_on: '2026-10-01',
  ends_on: '2026-10-29',
  timezone: 'America/Sao_Paulo',
}
describe('Resource classification and deadlines', () => {
  it('keeps date-only deadlines open through the published calendar date, without manufacturing a time', () => {
    expect(calculatedStatus(open, now)).toBe('ABERTA')
    expect(calculatedStatus(open, new Date('2026-10-30T02:59:59Z'))).toBe('ABERTA')
    expect(calculatedStatus(open, new Date('2026-10-30T03:00:00Z'))).toBe('ENCERRADA')
    expect(open.ends_on).toBe('2026-10-29')
  })
  it('compares precise deadlines by the published timezone offset', () => {
    expect(calculatedStatus({ ...open, ends_on: '2026-10-29T11:59:59-03:00' }, now)).toBe(
      'ENCERRADA',
    )
    expect(calculatedStatus({ ...open, ends_on: '2026-10-29T12:00:01-03:00' }, now)).toBe('ABERTA')
  })
  it.each(['PROJETO_FINANCIADO', 'HISTORICO_FINANCIADOR'])(
    'never classifies %s as open',
    (kind) => {
      expect(calculatedStatus({ ...open, kind }, now)).toBe('HISTORICO')
    },
  )
  it('separates public transfers and tax fundraising authorizations', () => {
    expect(calculatedStatus({ ...open, kind: 'TRANSFERENCIA_PUBLICA' }, now)).toBe(
      'EXCLUSIVO_ORGAO_PUBLICO',
    )
    expect(calculatedStatus({ ...open, kind: 'AUTORIZACAO_CAPTACAO' }, now)).toBe(
      'CAPTACAO_DISPONIVEL',
    )
  })
  it('requires sufficient evidence, dates and a calendar reference zone', () => {
    for (const change of [
      { ends_on: null },
      { starts_on: null },
      { availability_evidence: false },
      { timezone: null },
    ])
      expect(calculatedStatus({ ...open, ...change }, now)).toBe('INFORMACOES_INSUFICIENTES')
    expect(calculatedStatus({ ...open, restricted: true }, now)).toBe('ACESSO_RESTRITO')
    expect(calculatedStatus({ ...open, starts_on: '2026-11-01' }, now)).toBe('EM_BREVE')
  })
  it('rejects invalid dates, datetimes without offset, injected fields and invalid requirement operators', () => {
    expect(sourceDate.safeParse('2026-02-30').success).toBe(false)
    expect(sourceDate.safeParse('2026-10-29T12:00:00').success).toBe(false)
    const base = {
      source_id: 'MANUAL',
      external_id: 'test',
      source_url: 'https://example.gov.br/edital',
      title: 'Fixture de teste',
      kind: 'OPORTUNIDADE',
    }
    expect(manualSchema.safeParse({ ...base, tenant_id: 'another' }).success).toBe(false)
    expect(manualSchema.safeParse({ ...base, availability_evidence: true }).success).toBe(false)
    expect(
      manualSchema.safeParse({
        ...base,
        requirements: [{ field: 'uf', operator: 'MIN', value: 1, evidence: 'test' }],
      }).success,
    ).toBe(false)
    expect(organizationSchema.safeParse({ name: 'Teste', tenant_id: 'another' }).success).toBe(
      false,
    )
  })
})

describe('Compatibility is an explained triage', () => {
  const eligibility = {
    field: 'applicant_type',
    operator: 'IN',
    value: ['OSC'],
    evidence: 'Somente organizações da sociedade civil',
  }
  it('explains a specific incompatibility using the actual data', () => {
    const r = compatibility({ applicant_type: 'EMPRESA' }, [eligibility], now)
    expect(r.status).toBe('INCOMPATIVEL')
    expect(r.checks[0]).toMatchObject({
      used: 'EMPRESA',
      requirement: ['OSC'],
      evidence: eligibility.evidence,
      result: 'NAO_ATENDE',
    })
  })
  it('does not treat absent or unstructured requirements as satisfied', () => {
    expect(compatibility(null, [eligibility], now).status).toBe('INFORMACOES_INSUFICIENTES')
    expect(compatibility({ applicant_type: 'OSC' }, [], now).status).toBe(
      'INFORMACOES_INSUFICIENTES',
    )
    expect(
      compatibility(
        { applicant_type: 'OSC' },
        [
          eligibility,
          { field: 'other', operator: 'TEXT', value: 'Certidão', evidence: 'Certidão exigida' },
        ],
        now,
      ).status,
    ).toBe('INFORMACOES_INSUFICIENTES')
  })
  it('calculates organization age by the anniversary, not elapsed 365-day periods', () => {
    const req = {
      field: 'age_years',
      operator: 'MIN',
      value: 3,
      evidence: 'Constituição há pelo menos 3 anos',
    }
    expect(compatibility({ founded_on: '2023-10-30' }, [req], now).status).toBe('INCOMPATIVEL')
    expect(compatibility({ founded_on: '2023-10-29' }, [req], now).status).toBe(
      'POTENCIALMENTE_COMPATIVEL',
    )
  })
})
