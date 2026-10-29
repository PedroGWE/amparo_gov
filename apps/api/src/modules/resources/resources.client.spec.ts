import {
  bndesRecord,
  eligibleProfiles,
  ResourcesClient,
  salicRecord,
  transferegovRecord,
} from './resources.client'
import { calculatedStatus } from './resources.domain'

describe('Official source adapters', () => {
  const program = {
    id_programa: 56378,
    nome_programa: 'Fixture baseada no esquema oficial',
    sit_programa: 'DISPONIBILIZADO',
    natureza_juridica_programa: 'Organização da Sociedade Civil',
    uf_programa: 'SP',
    dt_prog_ini_receb_prop: '2026-10-01',
    dt_prog_fim_receb_prop: '2026-11-30',
  }
  it('uses a stable variant key for repeated state/legal-nature rows', () => {
    const a = transferegovRecord(program, false, null)
    expect(transferegovRecord({ ...program }, false, null).external_id).toBe(a.external_id)
    expect(transferegovRecord({ ...program, uf_programa: 'RJ' }, false, null).external_id).not.toBe(
      a.external_id,
    )
    expect(a.external_id.startsWith('56378:')).toBe(true)
    expect(a.raw_data.id_programa).toBe(56378)
  })
  it('does not confuse parliamentary or named-beneficiary windows with open enrollment', () => {
    const r = transferegovRecord(
      {
        ...program,
        dt_prog_ini_receb_prop: null,
        dt_prog_fim_receb_prop: null,
        dt_prog_ini_emenda_par: '2026-10-01',
        dt_prog_fim_emenda_par: '2026-11-30',
        qualificacao_proposta: 'Proposta de Proponente de Emenda Parlamentar',
      },
      false,
      null,
    )
    expect(r.availability_evidence).toBe(false)
    expect(r.starts_on).toBeNull()
    expect(r.dates.some((d: any) => d.meaning === 'dt_prog_fim_emenda_par')).toBe(true)
  })
  it('does not infer legal eligibility from the social target audience', () => {
    const r = transferegovRecord(
      {
        id_programa: 1,
        ds_publico_alvo: 'Empresas e OSC',
        situacao_programa: 'Disponibilizado',
        programa_atende_a: [],
      },
      true,
      null,
    )
    expect(r.eligible_profiles).toEqual([])
    expect(eligibleProfiles('Administração Pública Municipal')).toEqual(['ORGAO_PUBLICO'])
  })
  it('keeps contracted and disbursed BNDES values distinct and excludes personal identifiers', () => {
    const r = bndesRecord(
      {
        numero_do_contrato: 123,
        descricao_do_projeto: 'Fixture de teste',
        valor_contratado_reais: 100,
        valor_desembolsado_reais: 30,
        cnpj: 'omitido',
        cliente: 'Instituição de teste',
      },
      null,
    )
    expect(r.kind).toBe('PROJETO_FINANCIADO')
    expect(r.project).toMatchObject({ contracted_amount: '100', disbursed_amount: '30' })
    expect(r.raw_data).not.toHaveProperty('cnpj')
    expect(
      calculatedStatus({
        ...r,
        ends_on: '2099-01-01',
        starts_on: '2020-01-01',
        timezone: 'America/Sao_Paulo',
      } as any),
    ).toBe('HISTORICO')
  })
  it('does not turn Rouanet execution dates or approved value into fundraising permission', () => {
    const r = salicRecord({
      PRONAC: '123 ',
      valor_aprovado: 100,
      valor_captado: 0,
      data_inicio: '2026-01-01',
      data_termino: '2027-01-01',
    })
    expect(r.kind).toBe('PROGRAMA')
    expect(r.availability_evidence).toBe(false)
    expect(r.ends_on).toBeNull()
    expect(() => salicRecord({ ano_captacao: 2026, pronac: ['123'] })).toThrow('SCHEMA')
  })
  it('blocks Prosas without explicit credentials and access confirmation', async () => {
    const old = process.env.PROSAS_ACCESS_CONFIRMED
    delete process.env.PROSAS_ACCESS_CONFIRMED
    await expect(new ResourcesClient().prosasPage()).rejects.toThrow(
      'PROSAS_CREDENCIAIS_E_PERMISSOES_PENDENTES',
    )
    if (old !== undefined) process.env.PROSAS_ACCESS_CONFIRMED = old
  })
  it('rejects network targets outside the official API allowlist', async () => {
    await expect(new ResourcesClient().request('https://127.0.0.1/internal')).rejects.toThrow(
      'URL_NAO_AUTORIZADA',
    )
    await expect(new ResourcesClient().request('http://api.salic.cultura.gov.br')).rejects.toThrow(
      'URL_NAO_AUTORIZADA',
    )
  })
})

describe('Bounded retries and schema errors', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })
  it('retries 429 with progressive waits and never follows arbitrary next links', async () => {
    jest.useFakeTimers()
    const mock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], total_pages: 1 })))
    const result = new ResourcesClient().page('TG_PARCERIAS', 0, 100, null)
    await jest.runAllTimersAsync()
    await expect(result).resolves.toMatchObject({ records: [], complete: true })
    expect(mock).toHaveBeenCalledTimes(2)
    expect(mock.mock.calls[0][1]).toMatchObject({ redirect: 'error' })
  })
  it('rejects the real-world Salic aggregate shape instead of importing it as a project', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ano_captacao: 2026, pronac: ['123'] })))
    await expect(new ResourcesClient().page('SALIC', 0, 100, null)).rejects.toThrow(
      'SCHEMA_SALIC_NAO_VALIDADO',
    )
  })
})
