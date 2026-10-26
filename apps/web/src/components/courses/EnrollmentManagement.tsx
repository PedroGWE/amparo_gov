import { FormEvent, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import useSWR from 'swr'
import axios from 'axios'
import { ClipboardCopy, Plus, Users } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import api from '@/lib/api'

type Turma = { id: string; nome: string; capacidade: number | null; inscritos: number; espera: number; vagas: number | null; curso_id?: string | null; curso?: { id: string; nome: string } | null; project: { name: string } | null }
type Enrollment = { id: string; status: 'ATIVA' | 'EM_ESPERA' | 'CONCLUIDA' | 'TRANCADA'; created_at: string; solicitante_tipo: string | null; solicitante_nome: string | null; solicitante_contato: string | null; aluno: { id: string; name: string; birth_date: string | null; cpf: string | null; responsaveis: { nome_completo: string; telefone: string | null }[] } }

function errorMessage(error: unknown) {
  const message = axios.isAxiosError(error) ? error.response?.data?.message : undefined
  return Array.isArray(message) ? message.join('. ') : typeof message === 'string' ? message : 'Não foi possível concluir a operação.'
}

export function EnrollmentManagement({ scopeCourseId, scopeCourseName }: { scopeCourseId?: string; scopeCourseName?: string }) {
  const router = useRouter()
  const tenant = typeof router.query.tenant === 'string' ? router.query.tenant : ''
  const [selectedId, setSelectedId] = useState('')
  const [editing, setEditing] = useState<Turma | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('30')
  const [courseId, setCourseId] = useState('')
  const { data: courses } = useSWR('/enrollment-admin/courses', () => api.get('/enrollment-admin/courses').then(r => r.data as { id: string; nome: string }[]))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [studentId, setStudentId] = useState('')
  const { data: courseStudents, error: studentsError } = useSWR(enrollOpen && scopeCourseId ? `/enrollment-admin/courses/${scopeCourseId}/students` : null,
    () => api.get(`/enrollment-admin/courses/${scopeCourseId}/students`).then(response => response.data as { id: string; name: string; status: string }[]),
  )
  const { data: allClasses, error: loadError, mutate: refreshClasses } = useSWR('/enrollment-admin/classes',
    () => api.get('/enrollment-admin/classes').then((response) => response.data as Turma[]),
    { refreshInterval: 15000 },
  )
  const classes = allClasses?.filter(turma => !scopeCourseId || turma.curso_id === scopeCourseId)
  const selected = classes?.find((turma) => turma.id === (selectedId || router.query.turma)) ?? classes?.[0]
  const classId = selected?.id
  const { data: enrollments, error: enrollmentsError, isLoading: loadingEnrollments, mutate: refreshEnrollments } = useSWR(classId ? `/enrollment-admin/classes/${classId}/enrollments` : null,
    () => api.get(`/enrollment-admin/classes/${classId}/enrollments`).then((response) => response.data as Enrollment[]),
    { refreshInterval: 15000 },
  )
  const active = enrollments?.filter((item) => item.status === 'ATIVA') ?? []
  const waiting = enrollments?.filter((item) => item.status === 'EM_ESPERA') ?? []
  const enrollmentPath = tenant ? `/${tenant}/inscricao${scopeCourseId ? `?curso=${encodeURIComponent(scopeCourseId)}` : ''}#invite-form` : ''

  async function refreshRegistrations() {
    await Promise.all([refreshClasses(), refreshEnrollments()])
  }

  function openCreate() { setEditing(null); setName(''); setCapacity('30'); setCourseId(scopeCourseId ?? ''); setError(''); setModalOpen(true) }
  function openEdit(turma: Turma) { setEditing(turma); setName(turma.nome); setCapacity(String(turma.capacidade ?? 30)); setCourseId(turma.curso_id ?? ''); setError(''); setModalOpen(true) }

  async function saveClass(event: FormEvent) {
    event.preventDefault()
    setSaving(true); setError(''); setMessage('')
    try {
      const payload = { nome: name.trim(), capacidade: Number(capacity), curso_id: scopeCourseId || courseId }
      if (editing) {
        const { data } = await api.patch(`/enrollment-admin/classes/${editing.id}`, payload)
        setMessage(data.promoted ? `Turma atualizada. ${data.promoted} aluno(s) promovido(s) da lista de espera.` : 'Turma atualizada.')
      } else {
        const { data } = await api.post('/enrollment-admin/classes', payload)
        setSelectedId(data.id)
        setMessage('Turma criada. Compartilhe o link de inscrição.')
      }
      setModalOpen(false)
      await Promise.all([refreshClasses(), refreshEnrollments()])
    } catch (caught) { setError(errorMessage(caught)) } finally { setSaving(false) }
  }

  async function closeEnrollment(item: Enrollment) {
    if (!window.confirm(`Encerrar a matrícula de ${item.aluno.name}? Uma vaga livre será oferecida ao primeiro aluno da espera.`)) return
    setError(''); setMessage('')
    try {
      const { data } = await api.post(`/enrollment-admin/enrollments/${item.id}/close`)
      setMessage(data.promoted ? `Matrícula encerrada. ${data.promoted} entrou na turma.` : 'Matrícula encerrada.')
      await Promise.all([refreshClasses(), refreshEnrollments()])
    } catch (caught) { setError(errorMessage(caught)) }
  }

  async function deleteEnrollment(item: Enrollment) {
    if (!window.confirm(`Excluir a inscrição de ${item.aluno.name} desta turma? ${item.status === 'ATIVA' ? 'A vaga será oferecida ao primeiro aluno da lista de espera. ' : ''}O cadastro do aluno em Alunos será mantido.`)) return
    setError(''); setMessage('')
    try {
      const { data } = await api.delete(`/enrollment-admin/enrollments/${item.id}`)
      setMessage(data.promoted ? `Inscrição excluída. ${data.promoted} entrou na turma.` : 'Inscrição excluída.')
      await Promise.all([refreshClasses(), refreshEnrollments()])
    } catch (caught) { setError(errorMessage(caught)) }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(`${window.location.origin}${enrollmentPath}`); setMessage('Link de inscrição copiado.') }
    catch { setError('Não foi possível copiar o link. Use o endereço exibido abaixo.') }
  }

  async function enrollStudent(event: FormEvent) {
    event.preventDefault()
    if (!classId || !studentId) return
    setSaving(true); setError(''); setMessage('')
    try {
      const { data } = await api.post(`/enrollment-admin/classes/${classId}/students/${encodeURIComponent(studentId)}`)
      setMessage(data.status === 'EM_ESPERA' ? `Aluno inscrito na reserva, posição ${data.posicao_espera}.` : 'Aluno matriculado na turma.')
      setEnrollOpen(false); setStudentId(''); await refreshRegistrations()
    } catch (caught) { setError(errorMessage(caught)) } finally { setSaving(false) }
  }

  return <div className="space-y-6">
    {scopeCourseId && selected && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-brand-800"><p>Matricule os alunos vinculados a {scopeCourseName} nas turmas disponíveis.</p><button type="button" className="btn-primary" onClick={() => { setStudentId(''); setError(''); setEnrollOpen(true) }}>Matricular aluno existente</button></div>}
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold text-gray-900">{scopeCourseName ? `Matrículas e reserva · ${scopeCourseName}` : 'Turmas e matrículas'}</h1><p className="text-sm text-gray-500">Defina as vagas e acompanhe as inscrições e a lista de espera.</p></div><button type="button" className="btn-primary inline-flex items-center gap-2" onClick={openCreate}><Plus className="h-4 w-4" /> Nova turma</button></div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500"><p>Novas inscrições são atualizadas automaticamente a cada 15 segundos.</p><button type="button" className="btn-ghost" onClick={refreshRegistrations}>Atualizar inscrições</button></div>
    {message && <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
    {error && !modalOpen && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {loadError && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Não foi possível carregar as turmas. Confira seu acesso. <button type="button" onClick={() => refreshClasses()} className="font-medium underline">Tentar novamente</button></div>}
    <section className="card space-y-3"><h2 className="font-semibold text-gray-900">Formulário para alunos e responsáveis</h2><p className="text-sm text-gray-600">Compartilhe este link. Quem preencher verá um formulário simples por etapas e receberá a confirmação da vaga ou da espera.</p><div className="flex flex-wrap items-center gap-3"><code className="break-all rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">{enrollmentPath || 'Carregando link...'}</code><button type="button" onClick={copyLink} disabled={!enrollmentPath} className="btn-ghost inline-flex items-center gap-2"><ClipboardCopy className="h-4 w-4" /> Copiar link</button>{tenant && <Link href={enrollmentPath} target="_blank" className="text-sm font-medium text-brand-700 hover:underline">Abrir formulário</Link>}</div></section>
    <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]"><div className="card"><h2 className="mb-4 font-semibold text-gray-900">Turmas</h2>{!classes && !loadError && <p className="text-sm text-gray-500">Carregando turmas...</p>}{classes?.length === 0 && <p className="text-sm text-gray-500">Nenhuma turma. Crie a primeira para abrir as inscrições.</p>}<div className="space-y-3">{classes?.map((turma) => <div key={turma.id} className={`rounded-xl border p-4 ${classId === turma.id ? 'border-brand-600 bg-brand-50' : 'border-gray-200'}`}><div className="flex items-start justify-between gap-2"><button type="button" className="text-left font-medium text-gray-900 hover:text-brand-700" onClick={() => setSelectedId(turma.id)}>{turma.nome}</button><button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => openEdit(turma)}>Editar vagas</button></div><p className="mt-1 text-xs text-gray-500">{turma.curso?.nome ? `${turma.curso.nome} · ` : ''}{turma.project?.name ?? 'Sem projeto'} · {turma.capacidade ?? 'Sem limite definido'} vagas</p><div className="mt-3 flex gap-3 text-xs"><span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-800">{turma.inscritos} matriculados</span><span className="rounded-full bg-amber-50 px-2 py-1 text-amber-900">{turma.espera} em espera</span></div></div>)}</div></div>
      <div className="card"><div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-brand-600" /><h2 className="font-semibold text-gray-900">{selected ? selected.nome : 'Selecione uma turma'}</h2></div>{selected && <><p className="mb-4 text-sm text-gray-600">{selected.inscritos} de {selected.capacidade ?? '—'} vagas ocupadas · {selected.vagas ?? '—'} disponíveis</p>{enrollmentsError && <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Não foi possível carregar as inscrições desta turma. <button type="button" onClick={() => refreshEnrollments()} className="font-medium underline">Tentar novamente</button></div>}{loadingEnrollments && <p role="status" className="text-sm text-gray-500">Carregando inscrições...</p>}{enrollments && <div className="space-y-5"><div><h3 className="mb-2 text-sm font-semibold text-gray-800">Matriculados ({active.length})</h3>{active.length === 0 && <p className="text-sm text-gray-500">Nenhum aluno matriculado.</p>}{active.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 border-b border-gray-100 py-2 text-sm"><div><p className="font-medium text-gray-900">{item.aluno.name}</p><p className="text-xs text-gray-500">{item.solicitante_nome ? `Contato: ${item.solicitante_nome} · ${item.solicitante_contato}` : item.aluno.responsaveis[0]?.nome_completo ? `Responsável: ${item.aluno.responsaveis[0].nome_completo}` : 'Inscrição interna'} · {new Date(item.created_at).toLocaleDateString('pt-BR')}</p></div><button type="button" className="text-xs text-red-600 hover:underline" onClick={() => closeEnrollment(item)}>Encerrar</button><button type="button" className="text-xs text-red-600 hover:underline" onClick={() => deleteEnrollment(item)}>Excluir inscrição</button></div>)}</div><div><h3 className="mb-2 text-sm font-semibold text-gray-800">Lista de espera ({waiting.length})</h3>{waiting.length === 0 && <p className="text-sm text-gray-500">Sem alunos em espera.</p>}{waiting.map((item, index) => <div key={item.id} className="flex items-center justify-between border-b border-gray-100 py-2 text-sm"><div><p className="font-medium text-gray-900">{index + 1}º · {item.aluno.name}</p><p className="text-xs text-gray-500">{item.solicitante_nome ? `${item.solicitante_nome} · ${item.solicitante_contato} · ` : ''}Inscrito em {new Date(item.created_at).toLocaleDateString('pt-BR')}</p></div><button type="button" className="text-xs text-red-600 hover:underline" onClick={() => deleteEnrollment(item)}>Excluir inscrição</button></div>)}</div></div>}</>}{!selected && <p className="text-sm text-gray-500">Escolha uma turma à esquerda para ver matrículas e fila.</p>}</div></section>
    <Modal open={enrollOpen} onClose={() => setEnrollOpen(false)} title={`Matricular aluno · ${selected?.nome ?? ""}`}><form onSubmit={enrollStudent} className="space-y-4"><p className="text-sm text-gray-600">{selected?.vagas ? `${selected.vagas} vagas disponíveis.` : "Turma completa: a inscrição será incluída na reserva."}</p>{studentsError && <p role="alert" className="text-sm text-red-700">Não foi possível carregar os alunos da atividade.</p>}<label className="block text-sm">Aluno vinculado *<select className="input mt-1 w-full" required value={studentId} onChange={event => setStudentId(event.target.value)}><option value="">Selecione o aluno</option>{courseStudents?.filter(student => student.status === "ATIVO" && !enrollments?.some(item => item.aluno.id === student.id)).map(student => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><p className="text-xs text-gray-500">Alunos já inscritos nesta turma não aparecem na seleção. Para acrescentar participantes à atividade, use a aba Alunos.</p>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setEnrollOpen(false)}>Cancelar</button><button type="submit" className="btn-primary" disabled={saving || !studentId || !enrollments}>{saving ? "Matriculando..." : "Confirmar matrícula"}</button></div></form></Modal>
    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Editar ${editing.nome}` : 'Nova turma'}><form onSubmit={saveClass} className="space-y-4"><label className="block text-sm text-gray-700">Nome da turma *<input className="input mt-1 w-full" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} placeholder="Ex.: Turma A - manhã" /></label><label className="block text-sm text-gray-700">Curso ou modalidade<select className="input mt-1 w-full" value={scopeCourseId || courseId} disabled={!!scopeCourseId} onChange={event => setCourseId(event.target.value)}><option value="">Sem curso ou modalidade definido</option>{courses?.map(course => <option key={course.id} value={course.id}>{course.nome}</option>)}</select></label><label className="block text-sm text-gray-700">Quantidade de alunos que a turma suporta *<input className="input mt-1 w-full" type="number" min="1" step="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} required /></label><p className="text-xs text-gray-500">Inscrições acima da capacidade entram na lista de espera. Ao abrir vagas, os primeiros da fila são promovidos automaticamente.</p>{error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}<div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Salvando...' : 'Salvar turma'}</button></div></form></Modal>
  </div>
}
