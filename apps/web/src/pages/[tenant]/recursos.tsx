import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/router'
import {
  ExternalLink,
  Search,
  Star,
  RefreshCw,
  CalendarClock,
  Landmark,
  SlidersHorizontal,
} from 'lucide-react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/hooks/useAuth'
import { resourcesService as service, type Resource } from '@/services/resources'

const missing = 'Não informado'
const profileNames: Record<string, string> = {
  EMPRESA: 'Empresa',
  OSC: 'OSC',
  ORGAO_PUBLICO: 'Órgão público',
  PESSOA_FISICA: 'Pessoa física',
  OUTROS: 'Outros perfis expressos',
}
const kindNames: Record<string, string> = {
  OPORTUNIDADE: 'Edital ou programa',
  AUTORIZACAO_CAPTACAO: 'Autorização para captar por incentivo fiscal',
  PROJETO_FINANCIADO: 'Projeto já financiado',
  HISTORICO_FINANCIADOR: 'Histórico de financiador',
  TRANSFERENCIA_PUBLICA: 'Transferência exclusiva a órgãos públicos',
  PROGRAMA: 'Inteligência de projetos — disponibilidade não comprovada',
}
const statusNames: Record<string, string> = {
  ABERTA: 'Inscrições abertas',
  CAPTACAO_DISPONIVEL: 'Disponível para captação',
  HISTORICO: 'Histórico de financiamento',
  EXCLUSIVO_ORGAO_PUBLICO: 'Exclusivo a órgãos públicos',
  INFORMACOES_INSUFICIENTES: 'Informações insuficientes',
  ACESSO_RESTRITO: 'Acesso restrito a beneficiários previstos',
  ENCERRADA: 'Prazo encerrado',
  EM_BREVE: 'Período futuro',
}
const stageNames: Record<string, string> = {
  IDENTIFICADA: 'Identificada',
  EM_ANALISE: 'Em análise',
  EM_PREPARACAO: 'Em preparação',
  ENVIADA: 'Enviada',
  CONCLUIDA: 'Concluída',
}
const syncNames: Record<string, string> = {
  READY: 'Pronto',
  RUNNING: 'Em execução',
  ERROR: 'Falha',
  SUCCESS: 'Concluída',
  PARTIAL: 'Parcial — continuará na próxima execução',
  FAILED: 'Falhou',
}
const tabs = [
  ['available', 'Disponíveis'],
  ['catalog', 'Catálogo completo'],
  ['fundraising', 'Captação fiscal'],
  ['history', 'Projetos e financiadores'],
  ['public', 'Órgãos públicos'],
  ['favorites', 'Favoritos'],
  ['profile', 'Perfil'],
  ['admin', 'Administração'],
] as const
const show = (v: unknown) => (v === null || v === undefined || v === '' ? missing : String(v))
function moneyLabel(amount: unknown) {
  if (typeof amount !== 'string' || !/^\d+(\.\d+)?$/.test(amount)) return missing
  const [integer, fraction = ''] = amount.split('.')
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + fraction.padEnd(2, '0')
}
function dateLabel(v: string | null | undefined) {
  if (!v) return missing
  if (/^\d{4}-\d{2}-\d{2}$/.test(v))
    return v.split('-').reverse().join('/') + ' (data, sem horário informado)'
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(v)) return v + ' (fuso não informado pela fonte)'
  return new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (Brasília)'
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}
function OfficialLink({ href, children }: { href?: string | null; children: ReactNode }) {
  if (!href || !href.startsWith('https://')) return <span>{missing}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-brand-700 underline"
    >
      {children}
      <ExternalLink size={13} />
    </a>
  )
}

export default function ResourcesPage() {
  const router = useRouter()
  const { user } = useAuth()
  const scope = user ? `${user.tenantId}:${user.id}` : null
  const manage = !!user?.permissions?.some((p) => p === '*' || p === 'editais:manage')
  const [tab, setTab] = useState('available'),
    [page, setPage] = useState(1)
  const [draft, setDraft] = useState<Record<string, string>>({}),
    [filters, setFilters] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string | null>(null),
    [manual, setManual] = useState(false)
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  const dashboard = useSWR(scope ? ['resources-dashboard', scope] : null, service.dashboard, {
    refreshInterval: 30000,
  })
  const globalAdmin =
    !!user?.permissions?.includes('*') && !!dashboard.data?.can_administer_connectors
  const catalogTab = ['available', 'catalog', 'history', 'fundraising', 'public'].includes(tab)
  const search = useSWR(
    scope && catalogTab ? ['resources-search', scope, tab, filters, page] : null,
    () => service.search({ ...filters, view: tab, page }),
    { refreshInterval: 60000 },
  )
  const favorites = useSWR(scope ? ['resources-favorites', scope] : null, service.favorites)
  const detail = useSWR(scope && selected ? ['resources-detail', scope, selected] : null, () =>
    service.detail(selected!),
  )
  const connectors = useSWR(
    scope && globalAdmin && tab === 'admin' ? ['resources-connectors', scope] : null,
    service.connectors,
    { refreshInterval: 10000 },
  )
  async function action(fn: () => Promise<unknown>, success: string) {
    setBusy(true)
    setMessage('')
    try {
      await fn()
      setMessage(success)
      await Promise.all([
        dashboard.mutate(),
        search.mutate(),
        favorites.mutate(),
        connectors.mutate(),
        detail.mutate(),
      ])
    } catch (e: any) {
      const payload = e.response?.data
      const m =
        payload?.message ||
        payload?.formErrors?.join(' ') ||
        (payload?.fieldErrors ? Object.values(payload.fieldErrors).flat().join(' ') : '')
      setMessage(
        typeof m === 'string'
          ? m
          : 'Não foi possível concluir. Confira os campos e as permissões e tente novamente.',
      )
    } finally {
      setBusy(false)
    }
  }
  const favoriteIds = new Set((favorites.data ?? []).map((f: any) => f.record_id))
  const failed = dashboard.error || search.error || favorites.error || connectors.error
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Oportunidades e recursos</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-600">
              Encontre recursos para projetos sociais e consulte o histórico de apoio em fontes
              oficiais.
            </p>
          </div>
          {manage && (
            <button className="btn-primary" onClick={() => setManual(true)}>
              Cadastrar registro manual
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            [Search, 'Oportunidades abertas', dashboard.data?.available],
            [Landmark, 'Registros de financiamento', dashboard.data?.history],
            [CalendarClock, 'Fontes cadastradas', dashboard.data?.sources?.length],
          ].map(([Icon, label, value]: any) => (
            <div className="card flex items-center gap-3 p-5" key={label}>
              <Icon className="text-brand-600" size={24} />
              <div>
                <p className="text-2xl font-bold">{value ?? '—'}</p>
                <p className="text-sm text-gray-500">{label}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-900">
          Editais abertos, autorizações fiscais e projetos já financiados aparecem em áreas
          próprias. Ausência de um requisito na fonte não significa dispensa. A inscrição é feita no
          canal oficial.
        </div>
        {message && (
          <p role="status" className="rounded-lg border bg-white p-3 text-sm">
            {message}
          </p>
        )}
        {failed && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
            Falha ao consultar os dados. Tente atualizar a página. Os registros persistidos são
            preservados.
          </p>
        )}
        <nav aria-label="Áreas de recursos" className="flex flex-wrap gap-2">
          {tabs
            .filter(([id]) => id !== 'admin' || manage)
            .map(([id, label]) => (
              <button
                key={id}
                onClick={() => {
                  setTab(id)
                  setPage(1)
                }}
                className={tab === id ? 'btn-primary' : 'btn-secondary'}
              >
                {label}
              </button>
            ))}
        </nav>
        {catalogTab && (
          <>
            <form
              className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault()
                setFilters(Object.fromEntries(Object.entries(draft).filter(([, v]) => v)))
                setPage(1)
              }}
            >
              {[
                ['q', 'Palavras-chave'],
                ['theme', 'Tema'],
                ['territory', 'Território (UF ou município exato)'],
                ['funder', 'Financiador'],
                ['support_type', 'Tipo de apoio'],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    className="input w-full"
                    value={draft[key] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                </Field>
              ))}
              <Field label="Perfil do proponente">
                <select
                  className="input w-full"
                  value={draft.profile ?? ''}
                  onChange={(e) => setDraft({ ...draft, profile: e.target.value })}
                >
                  <option value="">Todos</option>
                  {Object.entries(profileNames).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fonte">
                <select
                  className="input w-full"
                  value={draft.source ?? ''}
                  onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                >
                  <option value="">Todas</option>
                  {dashboard.data?.sources?.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end gap-2">
                <button className="btn-primary inline-flex items-center gap-2" type="submit">
                  <SlidersHorizontal size={16} />
                  Filtrar
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setDraft({})
                    setFilters({})
                    setPage(1)
                  }}
                >
                  Limpar
                </button>
              </div>
            </form>
            <p className="text-sm text-gray-500">
              {search.data?.total ?? '—'} registros. Campos não publicados aparecem como “Não
              informado”.
            </p>
            {search.isLoading && <p role="status">Carregando catálogo…</p>}
            {search.data && !search.data.data.length && (
              <div className="card p-8 text-center text-gray-500">
                Nenhum registro encontrado para os filtros. Consulte o catálogo completo e o estado
                das fontes abaixo.
              </div>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              {search.data?.data?.map((r: Resource) => (
                <RecordCard
                  key={r.id}
                  record={r}
                  saved={favoriteIds.has(r.id)}
                  onOpen={() => setSelected(r.id)}
                  onSave={() =>
                    action(
                      () =>
                        favoriteIds.has(r.id)
                          ? service.unfavorite(r.id)
                          : service.favorite(r.id, 'IDENTIFICADA'),
                      'Favoritos atualizados.',
                    )
                  }
                  disabled={busy}
                />
              ))}
            </div>
            {!!search.data?.total && (
              <div className="flex items-center justify-center gap-4">
                <button
                  disabled={page === 1}
                  className="btn-secondary"
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </button>
                <span>
                  {page} de {search.data.totalPages}
                </span>
                <button
                  disabled={page >= search.data.totalPages}
                  className="btn-secondary"
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}
        {tab === 'favorites' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Seus favoritos e suas anotações são privados e vinculados à organização atual.
            </p>
            {!favorites.data?.length && <p>Nenhum favorito cadastrado.</p>}
            {favorites.data?.map((f: any) => (
              <div className="card space-y-3 p-4" key={f.id}>
                <RecordCard
                  record={f.record}
                  saved
                  onOpen={() => setSelected(f.record_id)}
                  onSave={() => action(() => service.unfavorite(f.record_id), 'Favorito removido.')}
                  disabled={busy}
                />
                <FavoriteEditor
                  item={f}
                  disabled={busy}
                  onSave={(stage, notes) =>
                    action(
                      () => service.favorite(f.record_id, stage, notes),
                      'Etapa e anotações salvas.',
                    )
                  }
                />
              </div>
            ))}
          </div>
        )}
        {tab === 'profile' && scope && (
          <OrganizationForm
            scope={scope}
            canEdit={manage}
            onSave={(data) =>
              action(
                () => service.saveProfile(data),
                'Perfil salvo. A compatibilidade usará estes dados.',
              )
            }
          />
        )}
        {tab === 'admin' && manage && (
          <div className="space-y-4">
            <div className="card space-y-3 p-5">
              <h2 className="font-semibold">Registros e importação manual</h2>
              <p className="text-sm text-gray-600">
                Fundação Banco do Brasil, Petrobras Socioambiental e Lei de Incentivo ao Esporte:
                cadastre com link oficial. A importação aceita o formato JSON GTM documentado em
                docs/social-resources.md; não presume formato de exportação das fontes.
              </p>
              <label className="block text-sm">
                Importar arquivo JSON (até 200 registros e 1 MB)
                <input
                  className="mt-2 block max-w-full"
                  type="file"
                  accept=".json,application/json"
                  disabled={busy}
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.size > 1024 * 1024) {
                      setMessage('O arquivo excede 1 MB.')
                      return
                    }
                    try {
                      const data = JSON.parse(await f.text())
                      await action(
                        () => service.import(data),
                        'Arquivo importado. Repetir os mesmos identificadores atualiza os registros.',
                      )
                    } catch {
                      setMessage('Arquivo JSON inválido.')
                    }
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
            {globalAdmin ? (
              <>
                <h2 className="text-lg font-semibold">Conectores do catálogo público</h2>
                <p className="text-sm text-gray-500">
                  Configuração compartilhada, restrita aos operadores autorizados. Credenciais
                  permanecem no servidor.
                </p>
                {connectors.data?.map((c: any) => (
                  <ConnectorEditor
                    key={c.id}
                    connector={c}
                    disabled={busy}
                    onConfigure={(data) =>
                      action(() => service.configure(c.id, data), 'Configuração salva.')
                    }
                    onSync={() =>
                      action(
                        () => service.sync(c.id),
                        'Sincronização iniciada. Acompanhe o histórico.',
                      )
                    }
                  />
                ))}
              </>
            ) : (
              <p>
                Seu acesso permite administrar os registros manuais desta organização. A
                configuração global dos conectores exige autorização de operador.
              </p>
            )}
          </div>
        )}
        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">Próximos prazos e sincronização</h2>
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              {dashboard.data?.upcoming?.length ? (
                dashboard.data.upcoming.map((r: Resource) => (
                  <button
                    className="mb-3 block text-left text-sm text-brand-700 underline"
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                  >
                    {show(r.title)} · {dateLabel(r.ends_on)}
                  </button>
                ))
              ) : (
                <p className="text-sm text-gray-500">Nenhum prazo aberto confirmado no catálogo.</p>
              )}
            </div>
            <div className="space-y-2">
              {dashboard.data?.sources?.map((s: any) => (
                <div key={s.id} className="border-b pb-2 text-xs">
                  <span className="font-semibold">{s.name}</span> ·{' '}
                  {s.mode === 'MANUAL'
                    ? 'Cadastro manual'
                    : s.connector?.enabled
                      ? (syncNames[s.connector.status] ?? s.connector.status)
                      : 'Conector desabilitado'}
                  <p className="text-gray-500">
                    Última sincronização bem-sucedida: {dateLabel(s.connector?.last_success_at)}
                  </p>
                  {s.validation?.limitation && (
                    <p className="text-amber-800">{s.validation.limitation}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-sm">Histórico recente de coletas</summary>
            <div className="mt-3 space-y-2">
              {dashboard.data?.runs?.map((r: any) => (
                <p className="text-xs" key={r.id}>
                  {r.connector_id} · {syncNames[r.status]} · {dateLabel(r.started_at)} ·{' '}
                  {r.processed} registros · {r.pages} páginas {r.error ? '· ' + r.error : ''}
                </p>
              ))}
              {!dashboard.data?.runs?.length && (
                <p className="text-sm text-gray-500">Nenhuma execução registrada.</p>
              )}
            </div>
          </details>
        </section>
        <Modal
          open={!!selected}
          onClose={() => setSelected(null)}
          title="Detalhes do recurso"
          size="lg"
        >
          {detail.isLoading && <p>Carregando…</p>}
          {detail.error && <p role="alert">Registro indisponível para esta organização.</p>}
          {detail.data && (
            <div className="space-y-4">
              <a
                className="text-sm text-brand-700 underline"
                href={`/${router.query.tenant}/recursos/${detail.data.id}`}
              >
                Abrir página de detalhes
              </a>
              <RecordDetail
                record={detail.data}
                canManage={manage}
                onRemove={() =>
                  action(async () => {
                    await service.remove(detail.data!.id)
                    setSelected(null)
                  }, 'Registro manual removido.')
                }
              />
            </div>
          )}
        </Modal>
        <Modal
          open={manual}
          onClose={() => setManual(false)}
          title="Cadastro manual com fonte oficial"
          size="lg"
        >
          <ManualForm
            disabled={busy}
            onSave={(data) =>
              action(async () => {
                await service.manual(data)
                setManual(false)
              }, 'Registro manual salvo. Identificadores repetidos atualizam o registro.')
            }
          />
        </Modal>
      </div>
    </DashboardLayout>
  )
}

function RecordCard({
  record: r,
  saved,
  onOpen,
  onSave,
  disabled,
}: {
  record: Resource
  saved: boolean
  onOpen: () => void
  onSave: () => void
  disabled: boolean
}) {
  return (
    <article className="card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold">
          {kindNames[r.kind]}
        </span>
        <button
          aria-label={saved ? 'Remover favorito' : 'Adicionar favorito'}
          aria-pressed={saved}
          disabled={disabled}
          onClick={onSave}
        >
          <Star size={20} className={saved ? 'fill-amber-400 text-amber-500' : 'text-gray-400'} />
        </button>
      </div>
      <h2 className="text-base font-semibold text-gray-900">
        <button className="text-left hover:underline" onClick={onOpen}>
          {show(r.title)}
        </button>
      </h2>
      <p className="text-xs font-medium text-brand-700">{statusNames[r.calculated_status]}</p>
      {r.stale && (
        <p className="text-xs text-amber-800">Dados desatualizados — confirme na fonte oficial.</p>
      )}
      <p className="line-clamp-3 text-sm text-gray-600">{show(r.description)}</p>
      <div className="mt-auto space-y-1 text-xs text-gray-500">
        <p>
          Quem pode participar:{' '}
          {r.eligible_profiles?.map((p: string) => profileNames[p]).join(', ') || missing}
        </p>
        <p>Prazo: {dateLabel(r.ends_on)}</p>
        <p>Fonte: {r.source?.name ?? missing}</p>
        <p>Atualização na origem: {dateLabel(r.source_updated_at)}</p>
        <p>Última coleta bem-sucedida: {dateLabel(r.last_success_at)}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <button className="text-brand-700 underline" onClick={onOpen}>
          Ver requisitos e detalhes
        </button>
        <OfficialLink href={r.application_url ?? r.source_url}>
          {r.application_url ? 'Inscrição oficial' : 'Consultar fonte oficial'}
        </OfficialLink>
      </div>
    </article>
  )
}
export function RecordDetail({
  record: r,
  canManage,
  onRemove,
}: {
  record: Resource
  canManage: boolean
  onRemove: () => void
}) {
  const compatibilityNames: Record<string, string> = {
    POTENCIALMENTE_COMPATIVEL: 'Potencialmente compatível',
    INCOMPATIVEL: 'Incompatível por requisito identificado',
    INFORMACOES_INSUFICIENTES: 'Informações insuficientes',
  }
  const fieldNames: Record<string, string> = {
    applicant_type: 'Perfil do proponente',
    uf: 'UF',
    city: 'Município',
    legal_nature: 'Natureza jurídica',
    themes: 'Áreas de atuação',
    age_years: 'Tempo de existência (anos)',
    territorial_scope: 'Abrangência',
    other: 'Requisito textual',
  }
  return (
    <div className="space-y-5 text-sm">
      <div>
        <p className="font-semibold text-brand-700">
          {kindNames[r.kind]} · {statusNames[r.calculated_status]}
        </p>
        <h3 className="mt-2 text-xl font-bold">{show(r.title)}</h3>
      </div>
      <p className="whitespace-pre-wrap">{show(r.description)}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          ['Fonte', r.source?.name],
          ['Identificador na fonte', r.external_id],
          ['Situação na fonte', r.official_status],
          ['Tipo de apoio', r.support_type],
          ['Território', r.territories?.join(', ')],
          ['Proponentes', r.eligible_profiles?.map((p: string) => profileNames[p]).join(', ')],
          ['Início de recebimento', dateLabel(r.starts_on)],
          ['Fim de recebimento', dateLabel(r.ends_on)],
          ['Atualização na origem', dateLabel(r.source_updated_at)],
          ['Coletado inicialmente', dateLabel(r.collected_at)],
          ['Última coleta bem-sucedida', dateLabel(r.last_success_at)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-gray-500">{k}</dt>
            <dd>{show(v)}</dd>
          </div>
        ))}
      </dl>
      {r.stale && (
        <p className="text-amber-800">
          Dados desatualizados. Verifique as informações na fonte antes de decidir.
        </p>
      )}
      <p className="text-xs text-gray-500">
        {r.time_reference} Referência de comparação: {show(r.timezone)}.
      </p>
      <section>
        <h4 className="font-semibold">Valores e significado</h4>
        {r.amounts?.length ? (
          r.amounts.map((a: any, i: number) => (
            <p key={i}>
              {a.meaning}: R$ {moneyLabel(a.amount)}
            </p>
          ))
        ) : (
          <p>{missing}</p>
        )}
      </section>
      <section>
        <h4 className="font-semibold">Requisitos expressos</h4>
        <p className="whitespace-pre-wrap">{show(r.eligibility_text)}</p>
        {r.requirements?.map((x: any) => (
          <p className="mt-2 border-l-2 pl-3" key={x.id}>
            {x.evidence}
          </p>
        ))}
      </section>
      <section>
        <h4 className="font-semibold">Outras datas publicadas</h4>
        {r.dates?.length ? (
          r.dates.map((d: any, i: number) => (
            <p key={i}>
              {d.meaning}: {dateLabel(d.value)}
            </p>
          ))
        ) : (
          <p>{missing}</p>
        )}
      </section>
      <section>
        <h4 className="font-semibold">Documentos</h4>
        {r.documents?.length ? (
          r.documents.map((d: any, i: number) => (
            <p key={i}>
              <OfficialLink href={d.url}>{d.title}</OfficialLink>
            </p>
          ))
        ) : (
          <p>{missing}</p>
        )}
      </section>
      {r.project && (
        <section>
          <h4 className="font-semibold">Dados do projeto na fonte</h4>
          <p>Proponente: {show(r.project.proponent_name)}</p>
        </section>
      )}
      <section>
        <h4 className="font-semibold">Financiadores e evidências de apoio</h4>
        {r.funders?.length ? (
          r.funders.map((f: any) => (
            <p key={f.funder_id}>
              <OfficialLink href={f.funder.source_url}>{f.funder.name}</OfficialLink> · {f.meaning}
            </p>
          ))
        ) : (
          <p>{show(r.funder_name)}</p>
        )}
      </section>
      <section className="rounded-xl bg-gray-50 p-4">
        <h4 className="font-semibold">
          Compatibilidade: {compatibilityNames[r.compatibility?.status] ?? missing}
        </h4>
        <p className="mt-1 text-xs">{r.compatibility?.notice}</p>
        {!r.compatibility?.checks?.length && (
          <p className="mt-3">Não há requisitos estruturados suficientes para comparar o perfil.</p>
        )}
        {r.compatibility?.checks?.map((c: any, i: number) => (
          <div className="mt-3" key={i}>
            <p className="font-medium">
              {fieldNames[c.field] ?? c.field}:{' '}
              {c.result === 'ATENDE'
                ? 'Atende ao requisito comparado'
                : c.result === 'NAO_ATENDE'
                  ? 'Não atende'
                  : 'Não foi possível comparar'}
            </p>
            <p>Requisito oficial: {c.evidence}</p>
            <p>
              Dado usado do perfil:{' '}
              {Array.isArray(c.used) ? c.used.join(', ') || missing : show(c.used)}
            </p>
          </div>
        ))}
      </section>
      <div className="flex flex-wrap gap-4">
        <OfficialLink href={r.source_url}>Consultar registro na fonte</OfficialLink>
        <OfficialLink href={r.application_url}>Inscrever-se oficialmente</OfficialLink>
      </div>
      {canManage && r.origin === 'CADASTRO_MANUAL' && (
        <button className="btn-secondary text-red-700" onClick={onRemove}>
          Remover registro manual
        </button>
      )}
    </div>
  )
}

function FavoriteEditor({
  item,
  disabled,
  onSave,
}: {
  item: any
  disabled: boolean
  onSave: (s: string, n: string) => void
}) {
  const [stage, setStage] = useState(item.stage),
    [notes, setNotes] = useState(item.notes ?? '')
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(stage, notes)
      }}
    >
      <Field label="Etapa">
        <select className="input w-full" value={stage} onChange={(e) => setStage(e.target.value)}>
          {Object.entries(stageNames).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Anotações privadas">
        <textarea
          className="input w-full"
          maxLength={5000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <button disabled={disabled} className="btn-secondary justify-self-start">
        Salvar etapa e anotações
      </button>
    </form>
  )
}
function OrganizationForm({
  scope,
  canEdit,
  onSave,
}: {
  scope: string
  canEdit: boolean
  onSave: (data: any) => void
}) {
  const profile = useSWR(['resources-profile', scope], service.profile)
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    if (profile.data) {
      const {
        name,
        applicant_type,
        legal_nature,
        uf,
        city,
        founded_on,
        themes,
        territorial_scope,
      } = profile.data
      setData({
        name,
        applicant_type,
        legal_nature,
        uf,
        city,
        founded_on,
        themes,
        territorial_scope,
      })
    }
  }, [profile.data])
  if (profile.error) return <p role="alert">Não foi possível carregar o perfil.</p>
  if (!data) return <p>Carregando perfil…</p>
  return (
    <form
      className="card grid gap-4 p-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ ...data, themes: data.themes.map((v: string) => v.trim()).filter(Boolean) })
      }}
    >
      <p className="text-sm text-gray-500 sm:col-span-2">
        Informe a natureza e a atuação reais da organização. Dados ausentes geram “Informações
        insuficientes”.
      </p>
      {[
        ['name', 'Nome'],
        ['legal_nature', 'Natureza jurídica'],
        ['uf', 'UF'],
        ['city', 'Município'],
        ['territorial_scope', 'Abrangência territorial'],
      ].map(([k, label]) => (
        <Field label={label} key={k}>
          <input
            className="input w-full"
            required={k === 'name'}
            disabled={!canEdit}
            value={data[k] ?? ''}
            maxLength={k === 'uf' ? 2 : 200}
            onChange={(e) =>
              setData({
                ...data,
                [k]: (k === 'uf' ? e.target.value.toUpperCase() : e.target.value) || null,
              })
            }
          />
        </Field>
      ))}
      <Field label="Perfil do proponente">
        <select
          className="input w-full"
          disabled={!canEdit}
          value={data.applicant_type ?? ''}
          onChange={(e) => setData({ ...data, applicant_type: e.target.value || null })}
        >
          <option value="">Não informado</option>
          {Object.entries(profileNames).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Data de constituição">
        <input
          type="date"
          className="input w-full"
          disabled={!canEdit}
          value={data.founded_on ?? ''}
          onChange={(e) => setData({ ...data, founded_on: e.target.value || null })}
        />
      </Field>
      <Field label="Áreas de atuação (separadas por vírgula)">
        <input
          className="input w-full"
          disabled={!canEdit}
          value={data.themes.join(', ')}
          onChange={(e) =>
            setData({ ...data, themes: e.target.value.split(',').map((v: string) => v.trim()) })
          }
        />
      </Field>
      {canEdit && <button className="btn-primary justify-self-start">Salvar perfil</button>}
    </form>
  )
}
function ConnectorEditor({
  connector: c,
  disabled,
  onConfigure,
  onSync,
}: {
  connector: any
  disabled: boolean
  onConfigure: (d: any) => void
  onSync: () => void
}) {
  const [enabled, setEnabled] = useState(c.enabled),
    [hours, setHours] = useState(c.interval_hours),
    [size, setSize] = useState(c.page_size),
    [pages, setPages] = useState(c.max_pages)
  useEffect(() => {
    setEnabled(c.enabled)
    setHours(c.interval_hours)
    setSize(c.page_size)
    setPages(c.max_pages)
  }, [c.enabled, c.interval_hours, c.page_size, c.max_pages])
  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="font-semibold">{c.source.name}</h3>
          <p className="text-sm text-gray-500">
            {syncNames[c.status]} · cursor {c.cursor} · última coleta:{' '}
            {dateLabel(c.last_success_at)}
          </p>
        </div>
        <button
          className="btn-secondary inline-flex items-center gap-2"
          disabled={disabled || !c.enabled || c.status === 'RUNNING'}
          onClick={onSync}
        >
          <RefreshCw size={14} />
          Sincronizar
        </button>
      </div>
      <p className="text-sm text-amber-800">{c.source.validation?.limitation}</p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          onConfigure({ enabled, interval_hours: hours, page_size: size, max_pages: pages })
        }}
      >
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Habilitado
        </label>
        {[
          ['Intervalo (horas)', hours, setHours, 720],
          ['Registros por página', size, setSize, 200],
          ['Páginas por execução', pages, setPages, 100],
        ].map(([label, value, set, max]: any) => (
          <Field label={label} key={label}>
            <input
              type="number"
              min={1}
              max={max}
              className="input w-28"
              value={value}
              onChange={(e) => set(Number(e.target.value))}
            />
          </Field>
        ))}
        <button disabled={disabled || c.status === 'RUNNING'} className="btn-primary">
          Salvar configuração
        </button>
      </form>
      {c.last_error && <p className="text-sm text-red-700">Última falha: {c.last_error}</p>}
      <details>
        <summary className="cursor-pointer text-sm">Execuções e documentação</summary>
        <p className="my-3 text-sm">
          <OfficialLink href={c.source.documentation_url}>Documentação oficial</OfficialLink>
        </p>
        {c.runs.map((r: any) => (
          <p className="mb-2 text-xs" key={r.id}>
            {dateLabel(r.started_at)} · {syncNames[r.status]} · {r.processed} registros · {r.pages}{' '}
            páginas · cursor {r.cursor_start} → {r.cursor_end} {r.error ?? ''}
          </p>
        ))}
      </details>
    </div>
  )
}
function ManualForm({ disabled, onSave }: { disabled: boolean; onSave: (d: any) => void }) {
  const [data, setData] = useState<any>({
    source_id: 'MANUAL',
    external_id: '',
    title: '',
    source_url: '',
    kind: 'OPORTUNIDADE',
    eligible_profiles: [],
    availability_evidence: false,
    restricted: false,
  })
  const [advanced, setAdvanced] = useState(''),
    [error, setError] = useState('')
  function submit(e: FormEvent) {
    e.preventDefault()
    try {
      const extra = advanced ? JSON.parse(advanced) : {}
      onSave({ ...data, ...extra })
    } catch {
      setError('Os campos adicionais devem conter um objeto JSON válido.')
    }
  }
  return (
    <form className="space-y-4" onSubmit={submit}>
      <p className="text-sm text-gray-500">
        Copie dados e requisitos da fonte. Não preencha estimativas. Para atualizar, use a mesma
        fonte, identificador e tipo de registro.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fonte">
          <select
            className="input w-full"
            value={data.source_id}
            onChange={(e) => setData({ ...data, source_id: e.target.value })}
          >
            {[
              ['MANUAL', 'Outra fonte oficial'],
              ['FBB', 'Fundação Banco do Brasil'],
              ['PETROBRAS', 'Petrobras Socioambiental'],
              ['ESPORTE', 'Lei de Incentivo ao Esporte'],
            ].map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo de registro">
          <select
            className="input w-full"
            value={data.kind}
            onChange={(e) => setData({ ...data, kind: e.target.value })}
          >
            {Object.entries(kindNames).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {[
          ['external_id', 'Identificador na fonte'],
          ['title', 'Título'],
          ['source_url', 'Link oficial HTTPS'],
          ['application_url', 'Link de inscrição oficial'],
          ['theme', 'Tema'],
          ['funder_name', 'Financiador'],
          ['support_type', 'Tipo de apoio'],
          ['official_status', 'Situação expressa na fonte'],
        ].map(([k, label]) => (
          <Field label={label} key={k}>
            <input
              required={['external_id', 'title', 'source_url'].includes(k)}
              className="input w-full"
              type={k.endsWith('url') ? 'url' : 'text'}
              value={data[k] ?? ''}
              onChange={(e) => setData({ ...data, [k]: e.target.value || null })}
            />
          </Field>
        ))}
        <Field label="Início do recebimento (data)">
          <input
            type="date"
            className="input w-full"
            value={data.starts_on ?? ''}
            onChange={(e) =>
              setData({ ...data, starts_on: e.target.value || null, timezone: 'America/Sao_Paulo' })
            }
          />
        </Field>
        <Field label="Prazo final (data, sem horário)">
          <input
            type="date"
            className="input w-full"
            value={data.ends_on ?? ''}
            onChange={(e) =>
              setData({ ...data, ends_on: e.target.value || null, timezone: 'America/Sao_Paulo' })
            }
          />
        </Field>
      </div>
      <Field label="Descrição">
        <textarea
          className="input w-full"
          rows={3}
          value={data.description ?? ''}
          onChange={(e) => setData({ ...data, description: e.target.value || null })}
        />
      </Field>
      <Field label="Requisitos e proponentes conforme fonte">
        <textarea
          className="input w-full"
          rows={3}
          value={data.eligibility_text ?? ''}
          onChange={(e) => setData({ ...data, eligibility_text: e.target.value || null })}
        />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Perfis expressamente elegíveis</legend>
        <div className="flex flex-wrap gap-3">
          {Object.entries(profileNames).map(([k, v]) => (
            <label key={k} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={data.eligible_profiles.includes(k)}
                onChange={(e) =>
                  setData({
                    ...data,
                    eligible_profiles: e.target.checked
                      ? [...data.eligible_profiles, k]
                      : data.eligible_profiles.filter((x: string) => x !== k),
                  })
                }
              />
              {v}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={data.availability_evidence}
          onChange={(e) => setData({ ...data, availability_evidence: e.target.checked })}
        />
        A fonte comprova a disponibilidade e o período informado (confira a situação e o link
        oficial).
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={data.restricted}
          onChange={(e) => setData({ ...data, restricted: e.target.checked })}
        />
        Acesso restrito a beneficiários específicos.
      </label>
      <details>
        <summary className="cursor-pointer text-sm">Campos adicionais estruturados</summary>
        <p className="my-2 text-xs text-gray-500">
          Objeto JSON com territories, amounts, documents e requirements, conforme contrato
          documentado. Valores monetários devem ser strings decimais e ter significado.
        </p>
        <textarea
          aria-label="Campos adicionais JSON"
          className="input w-full font-mono text-xs"
          rows={8}
          value={advanced}
          onChange={(e) => setAdvanced(e.target.value)}
        />
      </details>
      {error && <p role="alert">{error}</p>}
      <button disabled={disabled} className="btn-primary">
        Salvar registro
      </button>
    </form>
  )
}
