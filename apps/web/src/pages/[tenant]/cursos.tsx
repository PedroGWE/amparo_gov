import type { GetServerSideProps } from 'next'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import useSWR from 'swr'
import axios from 'axios'
import { ClipboardCopy, GraduationCap, Plus, Users } from 'lucide-react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Modal } from '@/components/ui/Modal'
import api from '@/lib/api'
import { CourseStudents } from '@/components/courses/CourseStudents'

type Project = { id: string; name: string; code: string | null; total_budget: string | null; emendas?: Amendment[]; editais?: Notice[] }
type Amendment = { id: string; number: string | null; year: number; parlamentar_name: string; value: string }
type Notice = { id: string; titulo: string; descricao: string | null; valor_total: string | null; link_oficial: string | null; data_encerramento: string | null }
type Class = { id: string; nome: string; capacidade: number | null; inscritos: number; espera: number; vagas: number | null }
type Course = { id: string; nome: string; tipo: 'CURSO' | 'MODALIDADE'; descricao: string | null; ativo: boolean; inscricoes_abertas: boolean; projetos: Project[]; emendas: Amendment[]; editais: Notice[]; turmas: Class[]; total_alunos: number }
type Options = { projects: Project[]; emendas: Amendment[]; editais: Notice[] }
type CourseForm = { nome: string; tipo: 'CURSO' | 'MODALIDADE'; descricao: string; ativo: boolean; inscricoes_abertas: boolean; project_ids: string[]; emenda_ids: string[]; edital_ids: string[] }
const emptyForm: CourseForm = { nome: '', tipo: 'MODALIDADE', descricao: '', ativo: true, inscricoes_abertas: true, project_ids: [], emenda_ids: [], edital_ids: [] }
const money = (value: string | number | null) => Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const unique = <T extends { id: string },>(items: T[]) => Array.from(new Map(items.map(item => [item.id, item])).values())
function errorMessage(error: unknown) {
  const message = axios.isAxiosError(error) ? error.response?.data?.message : undefined
  return Array.isArray(message) ? message.join('. ') : typeof message === 'string' ? message : 'Não foi possível concluir a operação.'
}

export default function CursosPage() {
  const router = useRouter()
  const tenant = typeof router.query.tenant === 'string' ? router.query.tenant : ''
  const { data: courses, error: loadError, mutate } = useSWR('/enrollment-admin/courses', () => api.get('/enrollment-admin/courses').then(r => r.data as Course[]), { refreshInterval: 15000 })
  const { data: options, error: optionsError } = useSWR('/enrollment-admin/courses/options', () => api.get('/enrollment-admin/courses/options').then(r => r.data as Options))
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [modal, setModal] = useState<'course' | 'classes' | 'capacity' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CourseForm>(emptyForm)
  const [classForm, setClassForm] = useState({ nome: '', quantidade: '1', capacidade: '30', project_id: '' })
  const [editingClass, setEditingClass] = useState<Class | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const visible = courses?.filter(c => (!filter || c.tipo === filter) && c.nome.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  const selected = visible?.find(c => c.id === (selectedId || router.query.curso)) ?? visible?.[0]
  const amendments = selected ? unique([...selected.emendas, ...selected.projetos.flatMap(p => p.emendas ?? [])]) : []
  const notices = selected ? unique([...selected.editais, ...selected.projetos.flatMap(p => p.editais ?? [])]) : []
  const enrollmentPath = selected && tenant ? `/${tenant}/inscricao?curso=${encodeURIComponent(selected.id)}` : ''

  function openCourse(course?: Course) {
    setEditingId(course?.id ?? null)
    setForm(course ? { nome: course.nome, tipo: course.tipo, descricao: course.descricao ?? '', ativo: course.ativo, inscricoes_abertas: course.inscricoes_abertas, project_ids: course.projetos.map(p => p.id), emenda_ids: course.emendas.map(e => e.id), edital_ids: course.editais.map(e => e.id) } : { ...emptyForm })
    setError(''); setModal('course')
  }
  function toggle(field: 'project_ids' | 'emenda_ids' | 'edital_ids', id: string) {
    setForm(current => ({ ...current, [field]: current[field].includes(id) ? current[field].filter(value => value !== id) : [...current[field], id] }))
  }
  async function saveCourse(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const { data } = editingId ? await api.patch(`/enrollment-admin/courses/${editingId}`, form) : await api.post('/enrollment-admin/courses', form)
      setSelectedId(data.id); setSearch(''); setFilter(''); setModal(null); setMessage('Curso ou modalidade salvo.'); await mutate()
    } catch (caught) { setError(errorMessage(caught)) } finally { setSaving(false) }
  }
  async function saveClasses(event: FormEvent) {
    event.preventDefault(); if (!selected) return
    setSaving(true); setError('')
    try {
      if (modal === 'capacity' && editingClass) {
        const { data } = await api.patch(`/enrollment-admin/classes/${editingClass.id}`, { nome: classForm.nome.trim(), capacidade: Number(classForm.capacidade) })
        setMessage(data.promoted ? `Turma atualizada. ${data.promoted} aluno(s) da reserva receberam vaga.` : 'Turma atualizada.')
      } else {
        await api.post(`/enrollment-admin/courses/${selected.id}/classes`, { ...classForm, nome: classForm.nome.trim(), quantidade: Number(classForm.quantidade), capacidade: Number(classForm.capacidade), project_id: classForm.project_id || undefined })
        setMessage('Turmas criadas. O link de matrícula está pronto para compartilhar.')
      }
      setModal(null); await mutate()
    } catch (caught) { setError(errorMessage(caught)) } finally { setSaving(false) }
  }
  async function copyLink(path: string) {
    try { await navigator.clipboard.writeText(`${window.location.origin}${path}`); setMessage('Link de matrícula copiado.'); setError('') }
    catch { setError('Não foi possível copiar. Abra o formulário e copie o endereço do navegador.') }
  }

  return <DashboardLayout><div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold text-gray-900">Cursos e modalidades</h1><p className="mt-1 text-sm text-gray-500">Projetos, recursos e turmas organizados por atividade.</p></div><button type="button" onClick={() => openCourse()} className="btn-primary inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Novo curso ou modalidade</button></div>
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {error && !modal && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loadError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Não foi possível carregar os cursos. <button type="button" className="underline" onClick={() => mutate()}>Tentar novamente</button></p>}
    <div className="flex flex-wrap gap-3"><input className="input min-w-0 flex-1" aria-label="Buscar curso ou modalidade" placeholder="Buscar curso ou modalidade..." value={search} onChange={e => setSearch(e.target.value)} /><select className="input" aria-label="Tipo de atividade" value={filter} onChange={e => setFilter(e.target.value)}><option value="">Todos os tipos</option><option value="CURSO">Cursos</option><option value="MODALIDADE">Modalidades</option></select></div>
    <div className="grid items-start gap-5 xl:grid-cols-[300px_1fr]">
      <aside className="card space-y-2" aria-label="Cursos e modalidades">{!courses && !loadError && <p className="text-sm text-gray-500">Carregando cursos...</p>}{visible?.length === 0 && <p className="text-sm text-gray-500">Nenhum curso ou modalidade encontrado.</p>}{visible?.map(course => <button key={course.id} type="button" onClick={() => setSelectedId(course.id)} className={`w-full rounded-xl border p-4 text-left ${selected?.id === course.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:bg-gray-50'}`}><div className="flex items-center gap-2"><GraduationCap className="h-5 w-5 shrink-0 text-brand-600" /><span className="font-semibold text-gray-900">{course.nome}</span></div><p className="mt-2 text-xs text-gray-500">{course.tipo === 'CURSO' ? 'Curso' : 'Modalidade'} · {course.total_alunos ?? 0} aluno(s) · {course.turmas.length} turma(s) · {course.projetos.length} projeto(s)</p><p className="mt-1 text-xs text-gray-600">{!course.ativo ? 'Inativo' : course.inscricoes_abertas ? 'Inscrições abertas' : 'Inscrições encerradas'}</p></button>)}</aside>
      {selected && <main className="min-w-0 space-y-5">
                <section className="card space-y-3"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-brand-600">{selected.tipo === 'CURSO' ? 'Curso' : 'Modalidade'}</p><h2 className="text-xl font-semibold text-gray-900">{selected.nome}</h2></div><button type="button" className="btn-ghost" onClick={() => openCourse(selected)}>Editar e vincular recursos</button></div>{selected.descricao && <p className="whitespace-pre-line text-sm text-gray-600">{selected.descricao}</p>}<div className="flex flex-wrap gap-4 text-sm"><span>{selected.total_alunos ?? 0} alunos vinculados</span><span>{selected.turmas.reduce((n, t) => n + t.inscritos, 0)} matriculados</span><span>{selected.turmas.reduce((n, t) => n + t.espera, 0)} na reserva</span><span>{selected.turmas.reduce((n, t) => n + (t.vagas ?? 0), 0)} vagas disponíveis</span></div></section>
        <CourseStudents key={selected.id} courseId={selected.id} tenant={tenant} total={selected.total_alunos ?? 0} onLinked={mutate} />
        <section className="card space-y-3"><h3 className="font-semibold text-gray-900">Link de matrícula</h3><p className="text-sm text-gray-600">O formulário mostra somente as turmas de {selected.nome}. Turmas lotadas continuam recebendo alunos na reserva, por ordem de inscrição.</p>{selected.turmas.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Crie as turmas e defina as vagas para começar a receber matrículas.</p>}{(!selected.ativo || !selected.inscricoes_abertas) && <p className="text-sm text-amber-800">As inscrições estão encerradas. Reabra em “Editar e vincular recursos”.</p>}<code className="block break-all rounded-lg bg-gray-50 p-3 text-xs text-gray-700">{enrollmentPath}</code><div className="flex flex-wrap gap-3"><button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => copyLink(enrollmentPath)}><ClipboardCopy className="h-4 w-4" /> Copiar link de matrícula</button><Link href={enrollmentPath} target="_blank" className="btn-ghost">Abrir formulário</Link></div></section>
        <section className="card space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="inline-flex items-center gap-2 font-semibold text-gray-900"><Users className="h-5 w-5 text-brand-600" /> Turmas e vagas</h3><button type="button" className="btn-primary" onClick={() => { setClassForm({ nome: `${selected.nome} - Turma`, quantidade: '1', capacidade: '30', project_id: '' }); setError(''); setModal('classes') }}>Criar turmas</button></div><p className="text-xs text-gray-500">Ao ampliar a capacidade ou encerrar uma matrícula, os primeiros da reserva recebem as vagas automaticamente.</p>{selected.turmas.length === 0 && <p className="text-sm text-gray-500">Nenhuma turma vinculada. Para vincular uma turma existente, edite-a na aba Matrículas.</p>}{selected.turmas.map(turma => <div key={turma.id} className="rounded-xl border border-gray-200 p-4"><div className="flex flex-wrap justify-between gap-2"><h4 className="font-medium text-gray-900">{turma.nome}</h4><button type="button" className="text-sm font-medium text-brand-700" onClick={() => { setEditingClass(turma); setClassForm({ nome: turma.nome, quantidade: '1', capacidade: String(turma.capacidade ?? 30), project_id: '' }); setError(''); setModal('capacity') }}>Editar vagas</button></div><p className="mt-2 text-sm text-gray-600">{turma.inscritos}/{turma.capacidade ?? '—'} matriculados · {turma.espera} na reserva · {turma.vagas ?? '—'} vagas</p><div className="mt-3 flex flex-wrap gap-4 text-sm"><Link href={`/${tenant}/matriculas?turma=${encodeURIComponent(turma.id)}`} className="font-medium text-brand-700 hover:underline">Ver alunos e reserva</Link><button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => copyLink(`${enrollmentPath}&turma=${encodeURIComponent(turma.id)}`)}>Copiar link desta turma</button></div></div>)}</section>
        <section className="card space-y-3"><h3 className="font-semibold text-gray-900">Projetos vinculados ({selected.projetos.length})</h3>{!selected.projetos.length && <p className="text-sm text-gray-500">Nenhum projeto vinculado.</p>}{selected.projetos.map(project => <Link href={`/${tenant}/projetos/${project.id}`} key={project.id} className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50"><p className="font-medium text-brand-700">{project.name}</p><p className="mt-1 text-xs text-gray-500">{project.code || 'Sem código'} · Orçamento do projeto: {money(project.total_budget)}</p></Link>)}<p className="text-xs text-gray-500">Um projeto pode atender mais de uma modalidade. Seu orçamento é compartilhado entre elas.</p></section>
        <section className="card space-y-3"><h3 className="font-semibold text-gray-900">Emendas vinculadas ({amendments.length})</h3>{!amendments.length && <p className="text-sm text-gray-500">Nenhuma emenda identificada ou vinculada.</p>}{amendments.map(emenda => <div key={emenda.id} className="rounded-lg border border-gray-200 p-3 text-sm"><p className="font-medium text-gray-900">{emenda.number || 'Sem número'}/{emenda.year} · {emenda.parlamentar_name}</p><p className="mt-1 text-gray-600">{money(emenda.value)}</p></div>)}</section>
        <section className="card space-y-3"><h3 className="font-semibold text-gray-900">Licitações e editais vinculados ({notices.length})</h3><p className="text-xs text-gray-500">Inclui os editais dos projetos vinculados. Valores de editais e versões não são somados ao orçamento do projeto.</p>{!notices.length && <p className="text-sm text-gray-500">Nenhum edital vinculado. Cadastre na aba Editais e selecione ao editar este curso.</p>}{notices.map(notice => <div key={notice.id} className="rounded-lg border border-gray-200 p-3 text-sm"><p className="font-medium text-gray-900">{notice.titulo}</p>{notice.descricao && <p className="mt-1 whitespace-pre-line text-xs text-gray-600">{notice.descricao}</p>}<p className="mt-2 text-xs text-gray-500">Itens: {money(notice.valor_total)}{notice.data_encerramento ? ` · Encerramento: ${new Date(notice.data_encerramento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` : ''}</p>{notice.link_oficial && <a href={notice.link_oficial} target="_blank" rel="noreferrer" className="mt-2 inline-block font-medium text-brand-700 hover:underline">Abrir documento</a>}</div>)}</section>
      </main>}
    </div>
    <Modal open={modal === 'course'} onClose={() => setModal(null)} title={editingId ? 'Editar curso ou modalidade' : 'Novo curso ou modalidade'}><form onSubmit={saveCourse} className="space-y-4">
      <label className="block text-sm">Nome *<input className="input mt-1 w-full" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required minLength={2} maxLength={120} /></label><label className="block text-sm">Tipo *<select className="input mt-1 w-full" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as CourseForm['tipo'] })}><option value="CURSO">Curso</option><option value="MODALIDADE">Modalidade</option></select></label><label className="block text-sm">Descrição<textarea className="input mt-1 w-full" rows={3} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} maxLength={5000} /></label>
      <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} /> Ativo</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.inscricoes_abertas} onChange={e => setForm({ ...form, inscricoes_abertas: e.target.checked })} /> Inscrições abertas</label></div>
      {optionsError && <p role="alert" className="text-sm text-red-700">Não foi possível carregar os vínculos. Reabra esta janela após atualizar a página.</p>}
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Projetos</legend><div className="max-h-44 space-y-2 overflow-y-auto">{options?.projects.map(project => <label key={project.id} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={form.project_ids.includes(project.id)} onChange={() => toggle('project_ids', project.id)} /><span>{project.name} {project.code && <span className="text-xs text-gray-500">({project.code})</span>}</span></label>)}</div></fieldset>
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Emendas adicionais</legend><p className="text-xs text-gray-500">As emendas dos projetos selecionados aparecem automaticamente.</p><div className="max-h-36 space-y-2 overflow-y-auto">{options?.emendas.map(emenda => <label key={emenda.id} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={form.emenda_ids.includes(emenda.id)} onChange={() => toggle('emenda_ids', emenda.id)} /><span>{emenda.number}/{emenda.year} · {emenda.parlamentar_name}</span></label>)}</div></fieldset>
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Licitações e editais adicionais</legend><p className="text-xs text-gray-500">Os editais dos projetos selecionados aparecem automaticamente.</p><div className="max-h-44 space-y-2 overflow-y-auto">{options?.editais.map(edital => <label key={edital.id} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={form.edital_ids.includes(edital.id)} onChange={() => toggle('edital_ids', edital.id)} /><span>{edital.titulo}</span></label>)}</div></fieldset>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button type="submit" className="btn-primary" disabled={saving || !options}>{saving ? 'Salvando...' : 'Salvar'}</button></div>
    </form></Modal>
    <Modal open={modal === 'classes' || modal === 'capacity'} onClose={() => setModal(null)} title={modal === 'capacity' ? 'Editar turma e vagas' : `Criar turmas · ${selected?.nome ?? ''}`}><form onSubmit={saveClasses} className="space-y-4"><label className="block text-sm">Nome da turma *<input className="input mt-1 w-full" value={classForm.nome} onChange={e => setClassForm({ ...classForm, nome: e.target.value })} required minLength={2} maxLength={100} /></label>{modal === 'classes' && <><label className="block text-sm">Quantidade de turmas *<input className="input mt-1 w-full" type="number" min={1} max={50} step={1} required value={classForm.quantidade} onChange={e => setClassForm({ ...classForm, quantidade: e.target.value })} /></label><label className="block text-sm">Projeto da turma<select className="input mt-1 w-full" value={classForm.project_id} onChange={e => setClassForm({ ...classForm, project_id: e.target.value })}><option value="">Sem projeto definido</option>{selected?.projetos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></>}<label className="block text-sm">Vagas por turma *<input className="input mt-1 w-full" type="number" min={1} max={10000} step={1} required value={classForm.capacidade} onChange={e => setClassForm({ ...classForm, capacidade: e.target.value })} /></label><p className="text-sm text-gray-600">Ao esgotar as vagas, as novas inscrições entram na reserva. {modal === 'classes' && `Total a criar: ${Number(classForm.quantidade) * Number(classForm.capacidade)} vagas.`}</p>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : modal === 'capacity' ? 'Salvar vagas' : 'Criar turmas'}</button></div></form></Modal>
  </div></DashboardLayout>
}

export const getServerSideProps: GetServerSideProps = async ctx => {
  if (!ctx.req.cookies.refresh_token) return { redirect: { destination: '/login', permanent: false } }
  return { props: {} }
}
