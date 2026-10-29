import { Injectable } from '@nestjs/common'
import { createHash } from 'crypto'
import { calculatedStatus, sourceDate } from './resources.domain'

export type Row = Record<string, any>
export type NormalizedRecord = Row & {
  external_id: string
  source_url: string
  kind: string
  origin: string
  raw_data: Row
}
const TG = 'https://api-publica.transferegov.gestao.gov.br'
const BNDES = 'https://dadosabertos.bndes.gov.br'
const SALIC = 'https://api.salic.cultura.gov.br'
export const BNDES_RESOURCE = '6f56b78c-510f-44b6-8274-78a5b7e931f4'
export const textValue = (v: unknown): string | null =>
  v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim()
const money = (v: unknown) => (v == null || !/^\d+(\.\d+)?$/.test(String(v)) ? null : String(v))
const date = (v: unknown) => (typeof v === 'string' && sourceDate.safeParse(v).success ? v : null)
const pick = (r: Row, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]))
const normalize = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

export function eligibleProfiles(value: unknown): string[] {
  const s = normalize(value)
  const result: string[] = []
  if (/ORGANIZACAO DA SOCIEDADE CIVIL|ENTIDADE PRIVADA SEM FINS LUCRATIVOS/.test(s))
    result.push('OSC')
  if (/ADMINISTRACAO PUBLICA|CONSORCIO PUBLICO|ORGAO PUBLICO/.test(s)) result.push('ORGAO_PUBLICO')
  if (/EMPRESA PRIVADA|EMPRESA COM FINS LUCRATIVOS/.test(s)) result.push('EMPRESA')
  if (/PESSOA FISICA/.test(s)) result.push('PESSOA_FISICA')
  return result
}

export function transferegovRecord(
  r: Row,
  partnerships: boolean,
  reference: string | null,
): NormalizedRecord {
  if (r.id_programa == null) throw new Error('SCHEMA: programa sem identificador')
  const source = partnerships ? 'TG_PARCERIAS' : 'TG_DISCRICIONARIAS'
  const nature = textValue(
    partnerships
      ? (r.programa_atende_a ?? []).map((x: Row) => x.tp_atende_a).join('; ')
      : r.natureza_juridica_programa,
  )
  const eligible = eligibleProfiles(nature)
  const territories = partnerships
    ? (r.ufs_habilitadas ?? []).map((x: Row) => x.sg_uf).filter(Boolean)
    : [r.uf_programa].filter(Boolean)
  const qualification = textValue(
    partnerships ? r.qualificacao_beneficiario : r.qualificacao_proposta,
  )
  const start = date(partnerships ? r.dt_inicio_beneficiario_espontaneo : r.dt_prog_ini_receb_prop)
  const end = date(partnerships ? r.dt_fim_beneficiario_espontaneo : r.dt_prog_fim_receb_prop)
  const status = textValue(partnerships ? r.situacao_programa : r.sit_programa)
  // Emendas and named beneficiaries are never generalized to an open public call.
  const restricted = /EMENDA|ESPECIFIC/.test(normalize(qualification))
  const variant = partnerships
    ? ''
    : ':' +
      createHash('sha256')
        .update(
          JSON.stringify([
            r.uf_programa ?? null,
            r.natureza_juridica_programa ?? null,
            r.modalidade_programa ?? null,
            r.id_subtipo_programa ?? null,
            qualification,
          ]),
        )
        .digest('hex')
        .slice(0, 20)
  const sourceUrl = new URL(
    partnerships ? `${TG}/parcerias/programa` : `${TG}/discricionarias/todos-programas`,
  )
  sourceUrl.searchParams.set('id_programa', String(r.id_programa))
  const requirements: Row[] = []
  if (eligible.length)
    requirements.push({
      field: 'applicant_type',
      operator: 'IN',
      value: eligible,
      evidence: nature!,
    })
  if (territories.length)
    requirements.push({
      field: 'uf',
      operator: 'IN',
      value: territories,
      evidence: 'UF(s) habilitada(s) publicadas pela fonte: ' + territories.join(', '),
    })
  const criteria = textValue(
    partnerships ? r.ds_justificativa_tipo_projeto : r.criterios_de_selecao,
  )
  if (criteria)
    requirements.push({ field: 'other', operator: 'TEXT', value: criteria, evidence: criteria })
  if (qualification)
    requirements.push({
      field: 'other',
      operator: 'TEXT',
      value: qualification,
      evidence: qualification,
    })
  const allDates = Object.entries(r)
    .filter(([k, v]) => /^(dt_|data_)/.test(k) && date(v))
    .map(([meaning, value]) => ({ meaning, value }))
  const global = money(r.nr_vlr_global)
  const record: NormalizedRecord = {
    external_id: String(r.id_programa) + variant,
    source_url: sourceUrl.href,
    application_url: null,
    kind:
      eligible.length === 1 && eligible[0] === 'ORGAO_PUBLICO'
        ? 'TRANSFERENCIA_PUBLICA'
        : 'OPORTUNIDADE',
    origin: source,
    title: textValue(partnerships ? r.nm_programa : r.nome_programa),
    description: textValue(partnerships ? r.ds_objetivo : r.descricao),
    theme: null,
    territories,
    eligible_profiles: eligible,
    eligibility_text:
      [nature, criteria, qualification, textValue(r.observacao)].filter(Boolean).join('\n') || null,
    support_type: textValue(partnerships ? r.tp_instrumento : r.modalidade_programa),
    funder_name: textValue(partnerships ? r.nm_ente_repassador : r.desc_orgao_sup_programa),
    amounts: global
      ? [
          {
            meaning: 'Valor global do programa (não é valor por projeto)',
            amount: global,
            currency: 'BRL',
          },
        ]
      : [],
    dates: allDates,
    documents: [],
    starts_on: start,
    ends_on: end,
    // Calendar comparison reference; source publishes dates only, no closing time.
    timezone: 'America/Sao_Paulo',
    official_status: status,
    availability_evidence: normalize(status) === 'DISPONIBILIZADO' && !!start && !!end,
    restricted,
    source_updated_at: reference,
    requirements,
    raw_data: pick(
      r,
      partnerships
        ? [
            'id_programa',
            'cd_programa',
            'nm_programa',
            'situacao_programa',
            'programa_atende_a',
            'qualificacao_beneficiario',
            'ufs_habilitadas',
            'dt_inicio_beneficiario_espontaneo',
            'dt_fim_beneficiario_espontaneo',
            'dt_inicio_beneficiario_especifico',
            'dt_fim_beneficiario_especifico',
            'dt_inicio_beneficiario_emenda',
            'dt_fim_beneficiario_emenda',
            'nr_vlr_global',
            'ds_objetivo',
            'ds_justificativa_tipo_projeto',
          ]
        : [
            'id_programa',
            'cod_programa',
            'nome_programa',
            'sit_programa',
            'natureza_juridica_programa',
            'uf_programa',
            'modalidade_programa',
            'id_subtipo_programa',
            'qualificacao_proposta',
            'dt_prog_ini_receb_prop',
            'dt_prog_fim_receb_prop',
            'dt_prog_ini_emenda_par',
            'dt_prog_fim_emenda_par',
            'dt_prog_ini_benef_esp',
            'dt_prog_fim_benef_esp',
            'descricao',
            'criterios_de_selecao',
            'observacao',
          ],
    ),
  }
  record.calculated_status = calculatedStatus(record as any)
  return record
}

export function bndesRecord(r: Row, modified: string | null): NormalizedRecord {
  if (r.numero_do_contrato == null) throw new Error('SCHEMA: operação sem contrato')
  const contracted = money(r.valor_contratado_reais),
    disbursed = money(r.valor_desembolsado_reais)
  return {
    external_id: String(r.numero_do_contrato),
    source_url: `${BNDES}/dataset/operacoes-financiamento/resource/${BNDES_RESOURCE}`,
    kind: 'PROJETO_FINANCIADO',
    origin: 'BNDES_CKAN',
    title: textValue(r.descricao_do_projeto),
    description: textValue(r.descricao_do_projeto),
    theme: textValue(r.subsetor_cnae_agrupado),
    territories: [r.uf, r.municipio].filter(Boolean).map(String),
    eligible_profiles: [],
    eligibility_text: null,
    support_type: textValue(r.modalidade_de_apoio),
    funder_name: 'BNDES',
    amounts: [
      { meaning: 'Valor contratado', amount: contracted, currency: 'BRL' },
      { meaning: 'Valor desembolsado', amount: disbursed, currency: 'BRL' },
    ].filter((x) => x.amount != null),
    dates: r.data_da_contratacao
      ? [
          {
            meaning: 'Data da contratação (precisão conforme publicada)',
            value: r.data_da_contratacao,
          },
        ]
      : [],
    starts_on: null,
    ends_on: null,
    timezone: null,
    official_status: textValue(r.situacao_do_contrato),
    availability_evidence: false,
    restricted: false,
    calculated_status: 'HISTORICO',
    source_updated_at: modified,
    project: {
      proponent_name: textValue(r.cliente),
      contracted_amount: contracted,
      disbursed_amount: disbursed,
    },
    funder: {
      external_id: 'BNDES',
      name: 'BNDES',
      source_url: `${BNDES}/pt_BR/`,
      meaning: 'Operação de financiamento contratada; não constitui edital aberto',
      amount: contracted,
    },
    requirements: [],
    documents: [],
    raw_data: pick(r, [
      'numero_do_contrato',
      'cliente',
      'descricao_do_projeto',
      'uf',
      'municipio',
      'data_da_contratacao',
      'valor_contratado_reais',
      'valor_desembolsado_reais',
      'modalidade_de_apoio',
      'instrumento_financeiro',
      'situacao_do_contrato',
      'subsetor_cnae_agrupado',
    ]),
  }
}

export function salicRecord(r: Row): NormalizedRecord {
  if (!r.PRONAC || !('valor_captado' in r))
    throw new Error('SCHEMA: Salic sem projeto individual ou valor captado')
  const captured = money(r.valor_captado),
    approved = money(r.valor_aprovado)
  // Execution dates and approval are NOT evidence of permission to raise funds.
  return {
    external_id: String(r.PRONAC).trim(),
    source_url: `${SALIC}/api/v1/projetos?PRONAC=${encodeURIComponent(String(r.PRONAC).trim())}`,
    kind: captured && Number(captured) > 0 ? 'PROJETO_FINANCIADO' : 'PROGRAMA',
    origin: 'SALIC',
    title: textValue(r.nome),
    description: textValue(r.resumo),
    theme: textValue(r.area),
    territories: [r.UF, r.municipio].filter(Boolean),
    eligible_profiles: [],
    amounts: [
      { meaning: 'Valor aprovado', amount: approved, currency: 'BRL' },
      { meaning: 'Valor captado', amount: captured, currency: 'BRL' },
    ].filter((x) => x.amount != null),
    dates: ['data_inicio', 'data_termino']
      .filter((k) => r[k])
      .map((k) => ({ meaning: k + ' (execução, não captação)', value: r[k] })),
    official_status: textValue(r.situacao),
    availability_evidence: false,
    restricted: false,
    starts_on: null,
    ends_on: null,
    timezone: null,
    project: {
      proponent_name: textValue(r.proponente),
      approved_amount: approved,
      raised_amount: captured,
    },
    requirements: [],
    documents: [],
    raw_data: pick(r, [
      'PRONAC',
      'nome',
      'resumo',
      'area',
      'UF',
      'municipio',
      'proponente',
      'valor_aprovado',
      'valor_captado',
      'situacao',
      'data_inicio',
      'data_termino',
    ]),
  }
}

export class SourceError extends Error {
  constructor(public readonly code: string) {
    super(code)
  }
}
@Injectable()
export class ResourcesClient {
  private lastRequest = 0
  private slots: Promise<void> = Promise.resolve()
  async request(url: string, init?: RequestInit): Promise<any> {
    // URLs are constructed only by adapters. No user supplied fetch URL or redirects.
    const u = new URL(url)
    if (
      ![
        'api-publica.transferegov.gestao.gov.br',
        'dadosabertos.bndes.gov.br',
        'api.salic.cultura.gov.br',
        'api.prosas.com.br',
      ].includes(u.hostname) ||
      u.protocol !== 'https:'
    )
      throw new SourceError('URL_NAO_AUTORIZADA')
    for (let attempt = 0; attempt < 4; attempt++) {
      const slot = this.slots.then(async () => {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, 600 - (Date.now() - this.lastRequest))),
        )
        this.lastRequest = Date.now()
      })
      this.slots = slot.catch(() => undefined)
      await slot
      let response: Response
      try {
        response = await fetch(url, {
          ...init,
          headers: { Accept: 'application/json', ...init?.headers },
          redirect: 'error',
          signal: AbortSignal.timeout(25000),
        })
      } catch {
        if (attempt === 3) throw new SourceError('FONTE_INACESSIVEL_OU_TIMEOUT')
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
        continue
      }
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < 3) {
          const retry = response.headers.get('retry-after')
          const wait = retry
            ? /^\d+$/.test(retry)
              ? Number(retry) * 1000
              : Date.parse(retry) - Date.now()
            : 0
          await response.body?.cancel()
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(30000, Math.max(1000 * 2 ** attempt, wait || 0))),
          )
          continue
        }
        await response.body?.cancel()
        throw new SourceError(`HTTP_${response.status}`)
      }
      // Bound memory even if a provider ignores page size.
      const reader = response.body?.getReader()
      if (!reader) throw new SourceError('RESPOSTA_VAZIA')
      const chunks: Uint8Array[] = []
      let bytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.length
        if (bytes > 8 * 1024 * 1024) {
          await reader.cancel()
          throw new SourceError('RESPOSTA_EXCEDE_LIMITE')
        }
        chunks.push(value)
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        throw new SourceError('JSON_INVALIDO')
      }
    }
    throw new SourceError('FONTE_INACESSIVEL')
  }

  async metadata(source: string) {
    if (source.startsWith('TG_')) {
      const d = await this.request(
        `${TG}/${source === 'TG_PARCERIAS' ? 'parcerias' : 'discricionarias'}/data-atualizacao`,
      )
      return textValue(d.data_ultima_atualizacao)
    }
    if (source === 'BNDES') {
      const d = await this.request(`${BNDES}/api/3/action/package_show?id=operacoes-financiamento`)
      if (
        !d.success ||
        !d.result?.resources?.some((r: Row) => r.id === BNDES_RESOURCE && r.datastore_active)
      )
        throw new SourceError('RECURSO_CKAN_INDISPONIVEL')
      return textValue(d.result.metadata_modified)
    }
    return null
  }

  async page(
    source: string,
    cursor: number,
    size: number,
    reference: string | null,
  ): Promise<{ records: NormalizedRecord[]; next: number; complete: boolean }> {
    if (source === 'TG_DISCRICIONARIAS' || source === 'TG_PARCERIAS') {
      const partners = source === 'TG_PARCERIAS'
      const year = process.env.RESOURCES_PROGRAM_YEAR?.trim() || String(new Date().getFullYear())
      const url = new URL(
        `${TG}/${partners ? 'parcerias/programa' : 'discricionarias/todos-programas'}`,
      )
      url.search = new URLSearchParams({
        pagina: String(cursor + 1),
        tamanho_da_pagina: String(size),
        ano_programa: year,
      }).toString()
      const d = await this.request(url.href)
      if (!Array.isArray(d.data) || !Number.isInteger(d.total_pages))
        throw new SourceError('SCHEMA_TRANSFEREGOV')
      return {
        records: d.data.map((r: Row) => transferegovRecord(r, partners, reference)),
        next: cursor + 1,
        complete: cursor + 1 >= d.total_pages,
      }
    }
    if (source === 'BNDES') {
      const d = await this.request(
        `${BNDES}/api/3/action/datastore_search?resource_id=${BNDES_RESOURCE}&limit=${size}&offset=${cursor}&sort=numero_do_contrato%20asc`,
      )
      if (!d.success || !Array.isArray(d.result?.records) || typeof d.result.total !== 'number')
        throw new SourceError('SCHEMA_CKAN')
      return {
        records: d.result.records.map((r: Row) => bndesRecord(r, reference)),
        next: cursor + d.result.records.length,
        complete: cursor + d.result.records.length >= d.result.total,
      }
    }
    if (source === 'SALIC') {
      const d = await this.request(`${SALIC}/api/v1/projetos?limit=${size}&offset=${cursor}`)
      const rows = d?._embedded?.projetos
      if (!Array.isArray(rows)) throw new SourceError('SCHEMA_SALIC_NAO_VALIDADO')
      return {
        records: rows.map(salicRecord),
        next: cursor + rows.length,
        complete: rows.length < size,
      }
    }
    if (source === 'PROSAS') return this.prosasPage()
    throw new SourceError('FONTE_MANUAL')
  }

  async prosasPage(): Promise<never> {
    const id = process.env.PROSAS_CLIENT_ID,
      secret = process.env.PROSAS_CLIENT_SECRET
    const scopes = (process.env.PROSAS_SCOPES ?? '').split(' ')
    if (
      !id ||
      !secret ||
      !scopes.includes('confidential:processos.read') ||
      process.env.PROSAS_ACCESS_CONFIRMED !== 'true'
    )
      throw new SourceError('PROSAS_CREDENCIAIS_E_PERMISSOES_PENDENTES')
    const token = await this.request('https://api.prosas.com.br/auth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: id,
        client_secret: secret,
        scope: scopes.join(' '),
      }).toString(),
    })
    if (
      typeof token.access_token !== 'string' ||
      !String(token.scope ?? '')
        .split(' ')
        .includes('confidential:processos.read')
    )
      throw new SourceError('PROSAS_ESCOPO_NAO_CONFIRMADO')
    await this.request('https://api.prosas.com.br/selecao/api/v2/third_party/processos', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
    // Authorized account must validate returned schema/pagination and desired process IDs first.
    throw new SourceError('PROSAS_ACESSO_TESTADO_MAPEAMENTO_DOS_PROCESSOS_PENDENTE')
  }
}
