import { FormEvent, useState } from 'react'
import useSWR from 'swr'
import DashboardLayout from '@/components/layout/DashboardLayout'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import MonthlyWorkspace from '@/components/accountability/MonthlyWorkspace'

type NoteStatus = 'RASCUNHO' | 'ENVIANDO' | 'PROCESSANDO' | 'CONSULTA_PENDENTE' | 'AUTORIZADA' | 'REJEITADA' | 'CANCELANDO' | 'CANCELADA'
type Note = { id: string; transaction_id: string; status: NoteStatus; environment: string; amount: string; customer_name: string; number?: string; access_key?: string; provider_message?: string; cancellation_reason?: string; cancelled_at?: string; xml_storage_key?: string; pdf_storage_key?: string }
type Item = { id: string; transaction_id: string | null; description: string; amount: string; transaction?: { date: string; type: string; status: string; invoices?: { id: string; number?: string; status: string }[] } }
type Report = { id: string; title: string; period_start: string; period_end: string; type: string; status: string; total_received: string; total_spent: string; balance: string; project?: { name: string }; _count: { items: number; glosses: number; fiscal_notes: number } }
type Detail = Report & { items: Item[]; fiscal_notes: Note[] }
type Config = { configured: boolean; environment?: string; issuer_cnpj?: string; issuer_city_code?: string; webhook_configured?: boolean; message?: string }
type FiscalForm = { customer_document: string; customer_name: string; customer_city_code: string; customer_zip: string; customer_street: string; customer_number: string; customer_district: string; customer_email: string; service_city_code: string; service_code: string; nbs_code: string; municipal_service_code: string; service_description: string; competence_date: string; simples_code: string; special_regime_code: string; iss_code: string; iss_withholding_code: string }

const fetcher = (url: string) => api.get(url).then((r) => r.data)
const money = (value?: string) => Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())
const editable = (status: string) => ['RASCUNHO', 'PENDENTE_CORRECAO'].includes(status)
const blank: FiscalForm = { customer_document: '', customer_name: '', customer_city_code: '', customer_zip: '', customer_street: '', customer_number: '', customer_district: '', customer_email: '', service_city_code: '', service_code: '', nbs_code: '', municipal_service_code: '', service_description: '', competence_date: '', simples_code: '', special_regime_code: '', iss_code: '', iss_withholding_code: '' }
const fields: { key: keyof FiscalForm; title: string; required?: boolean; pattern?: string; type?: string }[] = [
  { key: 'customer_document', title: 'CPF/CNPJ do tomador', required: true },
  { key: 'customer_name', title: 'Nome/razão social', required: true },
  { key: 'customer_city_code', title: 'Município do tomador (IBGE)', required: true, pattern: '[0-9]{7}' },
  { key: 'customer_zip', title: 'CEP do tomador', required: true, pattern: '[0-9]{8}' },
  { key: 'customer_street', title: 'Logradouro', required: true },
  { key: 'customer_number', title: 'Número', required: true },
  { key: 'customer_district', title: 'Bairro', required: true },
  { key: 'customer_email', title: 'Email do tomador', type: 'email' },
  { key: 'competence_date', title: 'Competência', required: true, type: 'date' },
  { key: 'service_city_code', title: 'Município da prestação (IBGE)', required: true, pattern: '[0-9]{7}' },
  { key: 'service_code', title: 'Código nacional do serviço', required: true, pattern: '[0-9]{6}' },
  { key: 'nbs_code', title: 'Código NBS (se aplicável)', pattern: '[0-9]{9}' },
  { key: 'municipal_service_code', title: 'Código municipal (se exigido)' },
  { key: 'simples_code', title: 'Opção Simples Nacional (código)', required: true, pattern: '[0-9]+' },
  { key: 'special_regime_code', title: 'Regime especial (código)', required: true, pattern: '[0-9]+' },
  { key: 'iss_code', title: 'Tributação ISS (código)', required: true, pattern: '[0-9]+' },
  { key: 'iss_withholding_code', title: 'Retenção ISS (código)', required: true, pattern: '[0-9]+' },
]
function errorText(error: unknown) {
  const value = (error as { response?: { data?: { message?: string | string[] } } }).response?.data?.message
  return Array.isArray(value) ? value.join('; ') : value ?? 'Não foi possível concluir a operação.'
}

export default function AccountabilityPage() {
  const user = useAuthStore((s) => s.user)
  // Sessões criadas antes deste recurso não têm permissões no usuário persistido;
  // nesse caso o backend continua sendo a autoridade e responde 403 se necessário.
  const canIssue = !user?.permissions || user.permissions.some((p) => p === '*' || p === 'accountability:review')
  const { data: reports, error, isLoading, mutate } = useSWR<Report[]>('/accountability', fetcher)
  const { data: config } = useSWR<Config>('/accountability/fiscal/config', fetcher)
  const { data: projects } = useSWR<{ data: { id: string; name: string }[] }>('/projects?limit=100', fetcher)
  const [selected, setSelected] = useState<string | null>(null)
  const { data: detail, mutate: refreshDetail } = useSWR<Detail>(selected ? `/accountability/${selected}` : null, fetcher)
  const [title, setTitle] = useState(''), [start, setStart] = useState(''), [end, setEnd] = useState('')
  const [projectId, setProjectId] = useState(''), [type, setType] = useState('PARCIAL')
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const [transaction, setTransaction] = useState<Item | null>(null), [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<FiscalForm>(blank)

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const { data } = await api.post('/accountability', { title, period_start: start, period_end: end, type, ...(projectId && { project_id: projectId }) })
      await api.post(`/accountability/${data.id}/consolidate`)
      setTitle(''); setStart(''); setEnd(''); setProjectId(''); setSelected(data.id)
      setMessage('Prestação criada. Confira as transações antes de revisar.'); await mutate()
    } catch (e) { setMessage(errorText(e)) } finally { setBusy(false) }
  }
  async function act(call: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage('')
    try { await call(); await Promise.all([mutate(), refreshDetail()]); setMessage(success); return true }
    catch (e) { setMessage(errorText(e)); return false }
    finally { setBusy(false) }
  }
  async function download(url: string, filename: string) {
    try {
      const { data } = await api.get(url, { responseType: 'blob' })
      const objectUrl = URL.createObjectURL(data), a = document.createElement('a')
      a.href = objectUrl; a.download = filename; a.click()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (e) { setMessage(errorText(e)) }
  }
  function openForm(item: Item, noteId: string | null = null) {
    setTransaction(item); setEditing(noteId)
    setForm({ ...blank, service_description: item.description, competence_date: item.transaction?.date.slice(0, 10) ?? '', service_city_code: config?.issuer_city_code ?? '' })
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!detail || !transaction?.transaction_id) return
    const payload = { ...form, transaction_id: transaction.transaction_id,
      customer_document: form.customer_document.replace(/\D/g, ''),
      customer_zip: form.customer_zip.replace(/\D/g, ''),
      customer_email: form.customer_email || undefined, nbs_code: form.nbs_code || undefined,
      municipal_service_code: form.municipal_service_code || undefined }
    const ok = await act(() => editing
      ? api.patch(`/accountability/${detail.id}/fiscal-notes/${editing}`, payload)
      : api.post(`/accountability/${detail.id}/fiscal-notes`, payload), 'Rascunho fiscal salvo para revisão.')
    if (ok) { setTransaction(null); setEditing(null) }
  }
  async function issue(note: Note) {
    if (!detail || !window.confirm(`Enviar NFS-e em ${note.environment === 'PRODUCAO' ? 'PRODUÇÃO, com validade fiscal' : 'HOMOLOGAÇÃO, sem valor fiscal'} para ${note.customer_name}?`)) return
    await act(() => api.post(`/accountability/${detail.id}/fiscal-notes/${note.id}/issue`), 'Solicitação enviada. Consulte até receber autorização.')
  }
  async function cancelNote(note: Note) {
    if (!detail) return
    const justification = window.prompt('Informe a justificativa do cancelamento (15 a 255 caracteres):')?.trim()
    if (!justification) return
    if (justification.length < 15 || justification.length > 255) { setMessage('A justificativa deve ter entre 15 e 255 caracteres.'); return }
    if (!window.confirm('O cancelamento fiscal é definitivo. Deseja continuar?')) return
    await act(() => api.post(`/accountability/${detail.id}/fiscal-notes/${note.id}/cancel`, { justification }), 'Cancelamento processado. Confira a situação fiscal da nota.')
  }

  return <DashboardLayout><div className="space-y-6 pb-12">
    <header><h1 className="text-2xl font-semibold text-gray-900">Prestação de contas</h1><p className="text-sm text-gray-500">Receitas, despesas e NFS-e vinculadas por projeto e período.</p></header>
    <MonthlyWorkspace />
    <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><strong>Emissão fiscal de serviços</strong><p className="mt-1">{config?.configured ? `Emissor ${config.issuer_cnpj} · ${config.environment === 'PRODUCAO' ? 'produção' : 'homologação sem valor fiscal'} · atualizações ${config.webhook_configured ? 'automáticas' : 'por consulta'}` : config?.message ?? 'Verificando configuração fiscal...'}</p><p className="mt-1 text-xs">Notas de fornecedores continuam no financeiro. Confirme códigos tributários e retenções com a contabilidade antes de enviar.</p></section>
    <form onSubmit={create} className="rounded-xl border bg-white p-5 space-y-3"><h2 className="font-semibold">Nova prestação</h2><div className="grid gap-3 md:grid-cols-3">
      <input required minLength={3} className="input" aria-label="Título" placeholder="Título da prestação" value={title} onChange={(e) => setTitle(e.target.value)} />
      <select className="input" aria-label="Projeto" value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Todos os projetos</option>{projects?.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select className="input" aria-label="Tipo" value={type} onChange={(e) => setType(e.target.value)}><option value="PARCIAL">Parcial</option><option value="FINAL">Final</option><option value="ANUAL">Anual</option></select>
      <label className="text-xs text-gray-600">Início<input required type="date" className="input mt-1" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label className="text-xs text-gray-600">Fim<input required type="date" min={start} className="input mt-1" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      <button disabled={busy} className="btn-primary self-end">Criar e consolidar</button>
    </div></form>
    {message && <p role="status" className="rounded-lg border bg-white p-3 text-sm text-gray-700">{message}</p>}
    {error ? <p className="text-red-600">Erro ao carregar prestações.</p> : isLoading ? <p>Carregando...</p> : !reports?.length ? <p className="rounded-xl border bg-white p-6 text-gray-500">Nenhuma prestação criada.</p> : <div className="grid gap-3 lg:grid-cols-2">{reports.map((report) => <button key={report.id} onClick={() => { setSelected(report.id); setTransaction(null) }} className={`text-left rounded-xl border bg-white p-4 hover:border-brand-500 ${selected === report.id ? 'border-brand-600 ring-1 ring-brand-300' : ''}`}>
      <span className="flex justify-between gap-2"><strong>{report.title}</strong><span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{label(report.status)}</span></span><span className="block text-xs text-gray-500 mt-1">{report.project?.name ?? 'Todos os projetos'} · {date(report.period_start)} a {date(report.period_end)}</span>
      <span className="grid grid-cols-3 mt-4 text-sm"><span><small className="block text-gray-500">Receitas</small>{money(report.total_received)}</span><span><small className="block text-gray-500">Despesas</small>{money(report.total_spent)}</span><span><small className="block text-gray-500">Saldo</small>{money(report.balance)}</span></span><span className="block text-xs text-gray-500 mt-3">{report._count.items} transações · {report._count.fiscal_notes} NFS-e · {report._count.glosses} glosas</span>
    </button>)}</div>}

    {detail && <section className="rounded-xl border bg-white p-5 space-y-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-semibold">{detail.title}</h2><p className="text-xs text-gray-500">Transações e evidências fiscais</p></div><div className="flex flex-wrap gap-2">
      {editable(detail.status) && <button disabled={busy} onClick={() => act(() => api.post(`/accountability/${detail.id}/consolidate`), 'Valores atualizados.')} className="btn-secondary text-sm">Recalcular</button>}
      <button onClick={() => download(`/accountability/${detail.id}/export.csv`, `prestacao-${detail.id}.csv`)} className="btn-secondary text-sm">Exportar CSV</button>
      {detail.status === 'RASCUNHO' && <button disabled={busy} onClick={() => act(() => api.patch(`/accountability/${detail.id}/status`, { status: 'EM_REVISAO' }), 'Prestação em revisão.')} className="btn-secondary text-sm">Enviar para revisão</button>}
      {detail.status === 'EM_REVISAO' && <button disabled={busy} onClick={() => act(() => api.patch(`/accountability/${detail.id}/status`, { status: 'RASCUNHO' }), 'Prestação devolvida ao rascunho.')} className="btn-secondary text-sm">Voltar ao rascunho</button>}
      {detail.status === 'PENDENTE_CORRECAO' && <button disabled={busy} onClick={() => act(() => api.patch(`/accountability/${detail.id}/status`, { status: 'EM_REVISAO' }), 'Prestação reenviada para revisão interna.')} className="btn-secondary text-sm">Reenviar para revisão</button>}
      {detail.status === 'EM_REVISAO' && <button disabled={busy} onClick={() => act(() => api.patch(`/accountability/${detail.id}/status`, { status: 'SUBMETIDO' }), 'Envio externo registrado no sistema.')} className="btn-primary text-sm">Registrar envio externo</button>}
    </div></div>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-left text-xs text-gray-500"><tr>{['Data', 'Transação', 'Tipo', 'Valor', 'Documento fiscal'].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody className="divide-y">{detail.items.map((item) => {
      const note = detail.fiscal_notes.find((n) => n.transaction_id === item.transaction_id)
      return <tr key={item.id}><td className="p-3 whitespace-nowrap">{item.transaction ? date(item.transaction.date) : '—'}</td><td className="p-3">{item.description}</td><td className="p-3">{label(item.transaction?.type ?? '')}</td><td className="p-3 whitespace-nowrap">{money(item.amount)}</td><td className="p-3 whitespace-nowrap">{note ? `${label(note.status)}${note.number ? ` · nº ${note.number}` : ''}` : item.transaction?.type === 'RECEITA' && editable(detail.status) && config?.configured ? <button onClick={() => openForm(item)} className="text-brand-700">Preparar NFS-e</button> : item.transaction?.invoices?.length ? `Fornecedor: ${item.transaction.invoices.map((n) => `nº ${n.number ?? 's/n'} (${label(n.status)})`).join(', ')}` : <span className="text-gray-400">—</span>}</td></tr>
    })}</tbody></table></div>
    {transaction && <form onSubmit={save} className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-4"><div className="flex justify-between"><div><h3 className="font-semibold">{editing ? 'Corrigir rascunho' : 'Preparar NFS-e'}</h3><p className="text-xs text-gray-600">{transaction.description} · {money(transaction.amount)}</p></div><button type="button" onClick={() => setTransaction(null)} className="text-sm text-gray-600">Fechar</button></div>
      <div className="grid gap-3 md:grid-cols-3">{fields.map((f) => <label key={f.key} className="text-xs text-gray-600">{f.title}<input required={f.required} pattern={f.pattern} type={f.type ?? 'text'} className="input mt-1" value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} /></label>)}</div>
      <label className="block text-xs text-gray-600">Descrição do serviço<textarea required minLength={10} className="input mt-1 min-h-20" value={form.service_description} onChange={(e) => setForm({ ...form, service_description: e.target.value })} /></label><p className="text-xs text-gray-600">O valor vem da receita consolidada e não pode ser alterado na nota.</p><button disabled={busy} className="btn-primary">Salvar rascunho</button>
    </form>}
    <div><h3 className="font-semibold">NFS-e vinculadas</h3>{!detail.fiscal_notes.length ? <p className="text-sm text-gray-500 mt-2">Nenhuma nota vinculada.</p> : <div className="space-y-2 mt-3">{detail.fiscal_notes.map((note) => <article key={note.id} className="rounded-lg border p-3 text-sm flex flex-wrap items-center justify-between gap-2"><div><strong>{note.customer_name}</strong> · {money(note.amount)}<p className="text-xs text-gray-500">{label(note.status)} · {note.environment === 'PRODUCAO' ? 'Produção' : 'Homologação'}{note.number && ` · nº ${note.number}`}</p>{note.provider_message && <p className="text-xs text-amber-700 max-w-xl">{note.provider_message}</p>}{note.access_key && <p className="text-xs text-gray-500 break-all">Chave: {note.access_key}</p>}</div><div className="flex flex-wrap gap-2">
      {note.status === 'RASCUNHO' && canIssue && <button disabled={busy} onClick={() => issue(note)} className="btn-primary text-xs">Enviar NFS-e</button>}
      {['RASCUNHO', 'REJEITADA'].includes(note.status) && editable(detail.status) && <button onClick={() => { const item = detail.items.find((i) => i.transaction_id === note.transaction_id); if (item) openForm(item, note.id) }} className="btn-secondary text-xs">Corrigir</button>}
      {note.status !== 'RASCUNHO' && <button disabled={busy} onClick={() => act(() => api.post(`/accountability/${detail.id}/fiscal-notes/${note.id}/sync`), 'Situação fiscal atualizada.')} className="btn-secondary text-xs">Consultar</button>}
      {note.status === 'AUTORIZADA' && canIssue && <button disabled={busy} onClick={() => cancelNote(note)} className="btn-secondary text-xs text-red-700">Cancelar NFS-e</button>}
      {note.xml_storage_key && <button onClick={() => download(`/accountability/${detail.id}/fiscal-notes/${note.id}/document/xml`, `nfse-${note.id}.xml`)} className="btn-secondary text-xs">XML</button>}
      {note.pdf_storage_key && <button onClick={() => download(`/accountability/${detail.id}/fiscal-notes/${note.id}/document/pdf`, `nfse-${note.id}.pdf`)} className="btn-secondary text-xs">DANFSe</button>}
    </div></article>)}</div>}</div>
    </section>}
  </div></DashboardLayout>
}
