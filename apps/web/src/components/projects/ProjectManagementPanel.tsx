import { useEffect, useMemo, useState, type FormEvent } from 'react'
import axios from 'axios'
import useSWR from 'swr'
import { CalendarCheck2, ClipboardList, Plus, Search, UsersRound } from 'lucide-react'
import { projectsService, type AttendanceRow, type ProjectManagement } from '@/services/projects'

type Tab = 'students' | 'attendance' | 'routine'

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join('. ')
    if (typeof message === 'string') return message
  }
  return 'Não foi possível concluir a ação. Tente novamente.'
}

export function ProjectManagementPanel({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<Tab>('students')
  const [classId, setClassId] = useState('')
  const [date, setDate] = useState(today)
  const [search, setSearch] = useState('')
  const [studentId, setStudentId] = useState('')
  const [className, setClassName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [schedule, setSchedule] = useState('')
  const [routineTitle, setRoutineTitle] = useState('')
  const [routineDescription, setRoutineDescription] = useState('')
  const [routineDue, setRoutineDue] = useState('')
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, boolean | null>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { data, error: loadError, isLoading, mutate } = useSWR<ProjectManagement>(['project-management', projectId], () => projectsService.management(projectId))
  const selectedClass = data?.classes.find((item) => item.id === classId)
  const { data: candidates } = useSWR(search.trim().length >= 2 ? ['project-student-search', projectId, search.trim()] : null,
    () => projectsService.searchStudents(projectId, search.trim()))
  const { data: attendance, mutate: refreshAttendance } = useSWR<AttendanceRow[]>(classId && tab === 'attendance' ? ['project-attendance', projectId, classId, date] : null,
    () => projectsService.attendance(projectId, classId, date))

  useEffect(() => { setClassId(''); setSearch(''); setStudentId(''); setTab('students') }, [projectId])

  useEffect(() => {
    if (data?.classes.length && !classId) setClassId(data.classes[0].id)
  }, [data, classId])

  useEffect(() => {
    setAttendanceDraft(Object.fromEntries((attendance ?? []).map((row) => [row.id, row.presente])))
  }, [attendance])

  const marked = useMemo(() => Object.values(attendanceDraft).filter((value) => value !== null).length, [attendanceDraft])

  async function run(action: () => Promise<unknown>, message: string | ((result: unknown) => string)) {
    setBusy(true); setError(''); setSuccess('')
    try {
      const result = await action()
      await mutate()
      setSuccess(typeof message === 'string' ? message : message(result))
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function linkStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!studentId) return
    await run(async () => {
      await projectsService.linkStudent(projectId, studentId)
      setStudentId(''); setSearch('')
    }, 'Aluno vinculado ao projeto. Ele pode continuar em outros projetos.')
  }

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const number = Number(capacity)
    if (!className.trim() || !Number.isInteger(number) || number < 1) { setError('Informe nome e capacidade válida da turma.'); return }
    await run(async () => {
      const created = await projectsService.createClass(projectId, { nome: className.trim(), capacidade: number, ...(schedule.trim() && { horario: schedule.trim() }) })
      setClassId(created.id); setClassName(''); setCapacity(''); setSchedule('')
    }, 'Turma criada.')
  }

  async function createRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!classId || routineTitle.trim().length < 2) return
    await run(async () => {
      await projectsService.createRoutine(projectId, classId, { titulo: routineTitle.trim(), ...(routineDescription.trim() && { descricao: routineDescription.trim() }), ...(routineDue && { prazo: `${routineDue}T12:00:00.000Z` }) })
      setRoutineTitle(''); setRoutineDescription(''); setRoutineDue('')
    }, 'Atividade adicionada à rotina da turma.')
  }

  async function saveAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!classId || !attendance?.length) return
    if (marked !== attendance.length) { setError('Marque presença ou falta de todos os alunos antes de salvar.'); return }
    await run(async () => {
      await projectsService.saveAttendance(projectId, classId, date, attendance.map((row) => ({ matricula_id: row.id, presente: attendanceDraft[row.id] === true })))
      await refreshAttendance()
    }, 'Chamada salva para esta data.')
  }

  return <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="font-semibold text-gray-900">Gestão de alunos e rotina</h4><p className="text-xs text-gray-600">Vínculos, turmas, chamada e atividades do projeto em um só lugar.</p></div>
      {data && <div className="flex flex-wrap gap-2 text-xs text-emerald-800"><span className="rounded-full bg-white px-2 py-1">{data.summary.students} alunos</span><span className="rounded-full bg-white px-2 py-1">{data.summary.classes} turmas</span><span className="rounded-full bg-white px-2 py-1">{data.summary.routines} atividades</span></div>}
    </div>

    <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Gestão do projeto">
      {([{ id: 'students', label: 'Alunos', icon: UsersRound }, { id: 'attendance', label: 'Chamada', icon: CalendarCheck2 }, { id: 'routine', label: 'Rotina', icon: ClipboardList }] as const).map(({ id, label, icon: Icon }) =>
        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setError(''); setSuccess('') }} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${tab === id ? 'bg-emerald-700 text-white' : 'bg-white text-emerald-800 hover:bg-emerald-100'}`}><Icon className="h-4 w-4" />{label}</button>)}
    </div>

    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="mt-3 rounded-lg bg-white p-3 text-sm text-emerald-700">{success}</p>}
    {loadError && <p role="alert" className="mt-3 text-sm text-red-700">Não foi possível carregar alunos e turmas.</p>}
    {isLoading && <p className="mt-4 text-sm text-gray-600">Carregando gestão do projeto...</p>}

    {data && tab === 'students' && <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <h5 className="text-sm font-semibold text-gray-900">Vincular aluno cadastrado</h5>
        <p className="mt-1 text-xs text-gray-500">O mesmo aluno pode participar de vários projetos.</p>
        <form onSubmit={linkStudent} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input className="input w-full pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setStudentId('') }} placeholder="Buscar aluno pelo nome" aria-label="Buscar aluno" /></div>
          <select className="input w-full" value={studentId} onChange={(event) => setStudentId(event.target.value)} aria-label="Selecionar aluno"><option value="">Selecione um aluno</option>{candidates?.map((student) => <option key={student.id} value={student.id}>{student.name}{student.turma ? ` · ${student.turma}` : ''}</option>)}</select>
          <button className="btn-primary inline-flex items-center justify-center gap-1" disabled={busy || !studentId}><Plus className="h-4 w-4" />Vincular</button>
        </form>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <h5 className="text-sm font-semibold text-gray-900">Alunos do projeto ({data.students.length})</h5>
        {data.students.length === 0 ? <p className="mt-3 text-sm text-gray-500">Nenhum aluno vinculado. Busque um cadastro acima ou cadastre alunos na aba Alunos.</p> : <div className="mt-2 max-h-64 divide-y divide-gray-100 overflow-y-auto">{data.students.map((student) => <div key={student.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><div><p className="font-medium text-gray-800">{student.name}</p><p className="text-xs text-gray-500">{student.turma || 'Sem turma'} · {student.status}</p></div><div className="flex flex-wrap gap-1">{student.vinculos_projetos.map((link) => <span key={link.id} className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">{link.project.name}</span>)}</div></div>)}</div>}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <h5 className="text-sm font-semibold text-gray-900">Turmas deste projeto</h5>
        <form onSubmit={createClass} className="mt-3 grid gap-2 sm:grid-cols-[1fr_100px_1fr_auto]">
          <input className="input" value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Nome da turma" minLength={2} required />
          <input className="input" type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} placeholder="Vagas" aria-label="Capacidade" required />
          <input className="input" value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder="Horário (opcional)" />
          <button className="btn-secondary" disabled={busy}>Criar turma</button>
        </form>
        {data.classes.map((item) => <div key={item.id} className="mt-3 rounded-lg bg-gray-50 p-3"><div className="flex justify-between gap-2"><div><p className="font-medium text-gray-800">{item.nome}</p><p className="text-xs text-gray-500">{item.matriculas.filter((enrollment) => enrollment.status === 'ATIVA').length}/{item.capacidade ?? '—'} matriculados · {item.matriculas.filter((enrollment) => enrollment.status === 'EM_ESPERA').length} em espera{typeof item.horario === 'string' ? ` · ${item.horario}` : ''}</p></div></div><div className="mt-2 flex flex-wrap gap-1">{data.students.filter((student) => !item.matriculas.some((enrollment) => enrollment.aluno.id === student.id)).map((student) => <button key={student.id} type="button" disabled={busy} onClick={() => run(() => projectsService.enrollStudent(projectId, item.id, student.id), (result) => (result as { status: string }).status === 'EM_ESPERA' ? `${student.name} entrou na lista de espera.` : `${student.name} matriculado na turma.`)} className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50">+ {student.name}</button>)}</div></div>)}
      </div>
    </div>}

    {data && tab === 'attendance' && <div className="mt-4 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2"><label className="text-sm text-gray-700">Turma<select className="input mt-1 w-full" value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">Selecione uma turma</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-sm text-gray-700">Data da chamada<input className="input mt-1 w-full" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
      {!data.classes.length ? <p className="text-sm text-gray-600">Crie uma turma em Alunos para iniciar a chamada.</p> : <div className="rounded-lg border border-gray-200 bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h5 className="text-sm font-semibold text-gray-900">{selectedClass?.nome}</h5><p className="text-xs text-gray-500">Últimos 30 dias: {selectedClass?.attendance30d.present ?? 0} presenças e {selectedClass?.attendance30d.absent ?? 0} faltas registradas</p></div><button type="button" className="btn-secondary text-xs" onClick={() => setAttendanceDraft(Object.fromEntries((attendance ?? []).map((row) => [row.id, true])))} disabled={!attendance?.length}>Marcar todos presentes</button></div>
        {attendance?.length ? <form onSubmit={saveAttendance} className="mt-3"><div className="max-h-64 divide-y divide-gray-100 overflow-y-auto">{attendance.map((row) => <div key={row.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span className="font-medium text-gray-800">{row.aluno.name}</span><select className="input w-32 py-1 text-xs" value={attendanceDraft[row.id] === null || attendanceDraft[row.id] === undefined ? '' : attendanceDraft[row.id] ? 'present' : 'absent'} onChange={(event) => setAttendanceDraft((current) => ({ ...current, [row.id]: event.target.value === '' ? null : event.target.value === 'present' }))} aria-label={`Presença de ${row.aluno.name}`}><option value="">Não marcado</option><option value="present">Presente</option><option value="absent">Faltou</option></select></div>)}</div><div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-gray-500">{marked}/{attendance.length} marcados</span><button className="btn-primary" disabled={busy}>Salvar chamada</button></div></form> : <p className="mt-3 text-sm text-gray-500">Não há matrículas ativas nesta turma.</p>}
      </div>}
    </div>}

    {data && tab === 'routine' && <div className="mt-4 space-y-3">
      <label className="block text-sm text-gray-700">Turma<select className="input mt-1 w-full" value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">Selecione uma turma</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
      {!data.classes.length ? <p className="text-sm text-gray-600">Crie uma turma em Alunos para organizar a rotina.</p> : <div className="rounded-lg border border-gray-200 bg-white p-3"><h5 className="text-sm font-semibold text-gray-900">Atividades da turma</h5><form onSubmit={createRoutine} className="mt-3 space-y-2"><input className="input w-full" value={routineTitle} onChange={(event) => setRoutineTitle(event.target.value)} placeholder="Atividade da rotina" minLength={2} required /><div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]"><input className="input" value={routineDescription} onChange={(event) => setRoutineDescription(event.target.value)} placeholder="Orientações (opcional)" /><input className="input" type="date" value={routineDue} onChange={(event) => setRoutineDue(event.target.value)} aria-label="Prazo da atividade" /><button className="btn-primary" disabled={busy}>Adicionar</button></div></form><div className="mt-3 max-h-64 divide-y divide-gray-100 overflow-y-auto">{selectedClass?.atividades.length ? selectedClass.atividades.map((activity) => <div key={activity.id} className="py-2 text-sm"><p className="font-medium text-gray-800">{activity.titulo}</p><p className="text-xs text-gray-500">{activity.descricao || 'Sem orientações'}{activity.prazo ? ` · Prazo ${new Date(activity.prazo).toLocaleDateString('pt-BR')}` : ''} · {activity.status}</p></div>) : <p className="py-3 text-sm text-gray-500">Nenhuma atividade registrada para esta turma.</p>}</div></div>}
    </div>}
  </section>
}
