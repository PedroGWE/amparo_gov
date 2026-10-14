import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { GetServerSideProps } from 'next'
import useSWR, { mutate } from 'swr'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'
import { Plus, Search, FolderKanban, CalendarDays, CircleDollarSign, ListTodo, AlertTriangle, CheckCircle2, Clock3, UsersRound, GraduationCap, CalendarCheck2 } from 'lucide-react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { ProjectManagementPanel } from '@/components/projects/ProjectManagementPanel'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import { projectsService, type Project, type ProjectPhase, type ProjectTask, type ProjectIndicator, type ProjectOverview, type ProjectType, type ProjectStatus } from '@/services/projects'

const PROJECT_TYPES: ProjectType[] = [
  'CULTURAL', 'ESPORTIVO', 'EDUCACIONAL', 'ASSISTENCIA_SOCIAL', 'SAUDE', 'AMBIENTAL', 'OUTROS',
]

const TASK_STATUS_LABELS: Record<ProjectTask['status'], string> = {
  PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada', BLOQUEADA: 'Bloqueada',
}

const PRIORITY_LABELS: Record<ProjectTask['priority'], string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente',
}

const PROJECT_STATUSES: ProjectStatus[] = [
  'RASCUNHO', 'CAPTACAO', 'APROVADO', 'EM_EXECUCAO', 'CONCLUIDO', 'SUSPENSO', 'CANCELADO',
]

const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  type: z.enum(['CULTURAL', 'ESPORTIVO', 'EDUCACIONAL', 'ASSISTENCIA_SOCIAL', 'SAUDE', 'AMBIENTAL', 'OUTROS']),
  description: z.string().transform((value) => value.trim() || undefined).optional(),
  code: z.string().transform((value) => value.trim() || undefined).optional(),
  start_date: z.string().transform((value) => value || undefined).optional(),
  end_date: z.string().transform((value) => value || undefined).optional(),
  total_budget: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.coerce.number().positive().optional(),
  ),
})

type FormData = z.infer<typeof schema>

const TYPE_LABELS: Record<ProjectType, string> = {
  CULTURAL: 'Cultural',
  ESPORTIVO: 'Esportivo',
  EDUCACIONAL: 'Educacional',
  ASSISTENCIA_SOCIAL: 'Assistência Social',
  SAUDE: 'Saúde',
  AMBIENTAL: 'Ambiental',
  OUTROS: 'Outros',
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  RASCUNHO: 'Rascunho', CAPTACAO: 'Captação', APROVADO: 'Aprovado',
  EM_EXECUCAO: 'Em Execução', CONCLUIDO: 'Concluído', SUSPENSO: 'Suspenso', CANCELADO: 'Cancelado',
}

function formatCurrency(v?: number | string) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v))
}

function formatDate(d?: string) {
  if (!d) return '—'
  const safeDate = d.length <= 10 ? new Date(`${d}T12:00:00`) : new Date(d)
  return safeDate.toLocaleDateString('pt-BR')
}

export default function ProjetosPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [workspaceTasks, setWorkspaceTasks] = useState<ProjectTask[]>([])
  const [workspacePhases, setWorkspacePhases] = useState<ProjectPhase[]>([])
  const [workspaceIndicators, setWorkspaceIndicators] = useState<ProjectIndicator[]>([])
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [workspaceError, setWorkspaceError] = useState('')
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>('RASCUNHO')
  const [projectBudget, setProjectBudget] = useState('')
  const [phaseName, setPhaseName] = useState('')
  const [phaseStart, setPhaseStart] = useState('')
  const [phaseEnd, setPhaseEnd] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskPhaseId, setTaskPhaseId] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskPriority, setTaskPriority] = useState<ProjectTask['priority']>('MEDIA')
  const [indicatorName, setIndicatorName] = useState('')
  const [indicatorUnit, setIndicatorUnit] = useState('')
  const [indicatorBaseline, setIndicatorBaseline] = useState('')
  const [indicatorTarget, setIndicatorTarget] = useState('')
  const [indicatorFrequency, setIndicatorFrequency] = useState<ProjectIndicator['frequency']>('MENSAL')
  const [indicatorDrafts, setIndicatorDrafts] = useState<Record<string, string>>({})

  const params: Record<string, string | number> = { page, limit: 20 }
  if (search) params.search = search
  if (statusFilter) params.status = statusFilter
  if (typeFilter) params.type = typeFilter

  const key = ['/projects', params] as const
  const { data, isLoading, error } = useSWR(key, () => projectsService.list(params), {
    keepPreviousData: true,
  })
  const { data: overview, mutate: mutateOverview } = useSWR<ProjectOverview>('/projects/overview', projectsService.overview)
  const activeProjectId = activeProject?.id

  useEffect(() => {
    if (!activeProjectId) return
    setWorkspaceBusy(true)
    setWorkspaceError('')
    Promise.all([projectsService.phases(activeProjectId), projectsService.tasks(activeProjectId), projectsService.indicators(activeProjectId)])
      .then(([phases, tasks, indicators]) => { setWorkspacePhases(phases); setWorkspaceTasks(tasks); setWorkspaceIndicators(indicators) })
      .catch(() => setWorkspaceError('Não foi possível carregar o acompanhamento deste projeto.'))
      .finally(() => setWorkspaceBusy(false))
  }, [activeProjectId])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(dto: FormData) {
    setSubmitError('')
    try {
      await projectsService.create(dto)
      await mutate(key)
      reset()
      setModalOpen(false)
    } catch (error) {
      const responseMessage = axios.isAxiosError(error) ? error.response?.data?.message : undefined
      setSubmitError(
        Array.isArray(responseMessage)
          ? responseMessage.join('. ')
          : responseMessage || 'Não foi possível criar o projeto.',
      )
    }
  }

  async function refreshWorkspace() {
    if (!activeProject) return
    const [phases, tasks, indicators] = await Promise.all([projectsService.phases(activeProject.id), projectsService.tasks(activeProject.id), projectsService.indicators(activeProject.id)])
    setWorkspacePhases(phases)
    setWorkspaceTasks(tasks)
    setWorkspaceIndicators(indicators)
    await Promise.all([mutate(key), mutateOverview()])
  }

  function openWorkspace(project: Project) {
    setActiveProject(project)
    setProjectStatus(project.status)
    setProjectBudget(project.total_budget == null ? '' : String(project.total_budget))
    setPhaseName(''); setPhaseStart(''); setPhaseEnd('')
    setTaskTitle(''); setTaskPhaseId(''); setTaskDueDate(''); setTaskPriority('MEDIA')
    setIndicatorName(''); setIndicatorUnit(''); setIndicatorBaseline(''); setIndicatorTarget(''); setIndicatorFrequency('MENSAL'); setIndicatorDrafts({})
  }

  async function saveProjectProgress() {
    if (!activeProject) return
    setWorkspaceBusy(true); setWorkspaceError('')
    try {
      const budget = projectBudget.trim() ? Number(projectBudget) : undefined
      if (budget !== undefined && (!Number.isFinite(budget) || budget < 0)) throw new Error('Informe um orçamento válido.')
      const updated = await projectsService.update(activeProject.id, { status: projectStatus, ...(budget !== undefined ? { total_budget: budget } : {}) })
      setActiveProject((current) => current ? { ...current, ...updated } : current)
      await Promise.all([mutate(key), mutateOverview()])
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'Não foi possível atualizar o projeto.')
    } finally { setWorkspaceBusy(false) }
  }

  async function addPhase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeProject || phaseName.trim().length < 2) return
    setWorkspaceBusy(true); setWorkspaceError('')
    try {
      await projectsService.createPhase(activeProject.id, { name: phaseName.trim(), order: workspacePhases.length, ...(phaseStart ? { start_date: phaseStart } : {}), ...(phaseEnd ? { end_date: phaseEnd } : {}) })
      setPhaseName(''); setPhaseStart(''); setPhaseEnd('')
      await refreshWorkspace()
    } catch { setWorkspaceError('Não foi possível adicionar a etapa. Verifique sua permissão e tente novamente.') }
    finally { setWorkspaceBusy(false) }
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeProject || taskTitle.trim().length < 2) return
    setWorkspaceBusy(true); setWorkspaceError('')
    try {
      await projectsService.createTask(activeProject.id, { title: taskTitle.trim(), ...(taskPhaseId ? { phase_id: taskPhaseId } : {}), ...(taskDueDate ? { due_date: new Date(`${taskDueDate}T12:00:00`).toISOString() } : {}), priority: taskPriority })
      setTaskTitle(''); setTaskDueDate('')
      await refreshWorkspace()
    } catch { setWorkspaceError('Não foi possível adicionar a atividade. Verifique sua permissão e tente novamente.') }
    finally { setWorkspaceBusy(false) }
  }

  async function updateTaskStatus(task: ProjectTask, status: ProjectTask['status']) {
    if (!activeProject || task.status === status) return
    setWorkspaceBusy(true); setWorkspaceError('')
    try {
      await projectsService.updateTask(activeProject.id, task.id, { status })
      await refreshWorkspace()
    } catch { setWorkspaceError('Não foi possível atualizar o andamento da atividade.') }
    finally { setWorkspaceBusy(false) }
  }

  async function addIndicator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeProject || indicatorName.trim().length < 2 || indicatorTarget === '') return
    setWorkspaceBusy(true); setWorkspaceError('')
    try {
      await projectsService.createIndicator(activeProject.id, {
        name: indicatorName.trim(),
        ...(indicatorUnit.trim() ? { unit: indicatorUnit.trim() } : {}),
        ...(indicatorBaseline !== '' ? { baseline: Number(indicatorBaseline) } : {}),
        target: Number(indicatorTarget),
        frequency: indicatorFrequency,
      })
      setIndicatorName(''); setIndicatorUnit(''); setIndicatorBaseline(''); setIndicatorTarget('')
      await refreshWorkspace()
    } catch { setWorkspaceError('Não foi possível cadastrar a meta. Confira os valores e sua permissão.') }
    finally { setWorkspaceBusy(false) }
  }

  async function saveIndicatorValue(indicator: ProjectIndicator) {
    if (!activeProject) return
    const rawValue = indicatorDrafts[indicator.id]
    if (rawValue == null || rawValue === '') return
    const value = Number(rawValue)
    if (!Number.isFinite(value)) { setWorkspaceError('Informe um valor válido para o indicador.'); return }
    setWorkspaceBusy(true); setWorkspaceError('')
    try {
      await projectsService.updateIndicator(activeProject.id, indicator.id, value)
      setIndicatorDrafts((current) => { const next = { ...current }; delete next[indicator.id]; return next })
      await refreshWorkspace()
    } catch { setWorkspaceError('Não foi possível registrar a medição do indicador.') }
    finally { setWorkspaceBusy(false) }
  }

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-700">Gestão de projetos sociais</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Projetos</h1>
          <p className="mt-1 text-sm text-gray-500">Acompanhe alunos, turmas, chamada, rotina, entregas e prazos em um só lugar.</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Novo projeto
        </button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Projetos" value={overview?.projects.total ?? '—'} icon={<FolderKanban className="h-5 w-5" />} />
        <SummaryCard label="Em execução" value={overview?.projects.executing ?? '—'} icon={<Clock3 className="h-5 w-5" />} tone="blue" />
        <SummaryCard label="Alunos vinculados" value={overview?.operations.students ?? '—'} icon={<UsersRound className="h-5 w-5" />} tone="green" />
        <SummaryCard label="Turmas" value={overview?.operations.classes ?? '—'} icon={<GraduationCap className="h-5 w-5" />} tone="blue" />
        <SummaryCard label="Presentes hoje" value={overview?.operations.presentToday ?? '—'} icon={<CalendarCheck2 className="h-5 w-5" />} tone="green" />
        <SummaryCard label="Faltas hoje" value={overview?.operations.absentToday ?? '—'} icon={<CalendarDays className="h-5 w-5" />} tone={(overview?.operations.absentToday ?? 0) > 0 ? 'amber' : 'gray'} />
        <SummaryCard label="Tarefas em aberto" value={overview?.tasks.open ?? '—'} icon={<ListTodo className="h-5 w-5" />} tone="amber" />
        <SummaryCard label="Prazos vencidos" value={overview?.tasks.overdue ?? '—'} icon={<AlertTriangle className="h-5 w-5" />} tone={(overview?.tasks.overdue ?? 0) > 0 ? 'red' : 'green'} />
        <SummaryCard label="Orçamento planejado" value={formatCurrency(overview?.budget.planned)} icon={<CircleDollarSign className="h-5 w-5" />} tone="green" />
        <SummaryCard label="Orçamento aprovado" value={formatCurrency(overview?.budget.approved)} icon={<CheckCircle2 className="h-5 w-5" />} tone="blue" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:flex-none">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            className="input pl-9 w-full sm:w-64"
            placeholder="Buscar projeto ou código..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select className="input w-full sm:w-48" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">Todos os status</option>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select className="input w-full sm:w-48" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}>
          <option value="">Todas as áreas</option>
          {PROJECT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        {(search || statusFilter || typeFilter) && <button className="text-sm text-gray-500 hover:text-gray-900" onClick={() => { setSearch(''); setStatusFilter(''); setTypeFilter(''); setPage(1) }}>Limpar filtros</button>}
      </div>

      {/* Project portfolio */}

      {/* Table */}
      {isLoading ? (
        <PageSpinner />
      ) : error ? (
        <p className="text-center text-sm text-red-500 py-12">Erro ao carregar projetos.</p>
      ) : !data?.data.length ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <FolderKanban className="h-12 w-12 text-gray-200 mb-3" />
          <p className="text-sm text-gray-500">Nenhum projeto encontrado.</p>
          <button className="btn-primary mt-4 flex items-center gap-2" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />Criar primeiro projeto
          </button>
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Projeto', 'Área', 'Situação', 'Vínculos ativos', 'Atividades', 'Prazo', 'Orçamento', 'Equipe'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.data.map((p: Project) => (
                  <tr key={p.id} onClick={() => openWorkspace(p)} onKeyDown={(event) => { if (event.key === 'Enter') openWorkspace(p) }} tabIndex={0} role="button" aria-label={`Abrir acompanhamento de ${p.name}`} className="cursor-pointer transition-colors hover:bg-emerald-50/50 focus:bg-emerald-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.name}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{p.code || 'Sem código'}{p.manager ? ` · ${p.manager.name}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{TYPE_LABELS[p.type]}</td>
                    <td className="px-4 py-3"><Badge value={p.status} /></td>
                    <td className="px-4 py-3 text-gray-700">{p._count.beneficiario_vinculos}</td>
                    <td className="px-4 py-3">
                      {p.task_progress?.total ? <>
                        <div className="flex items-center justify-between text-xs text-gray-600"><span>{p.task_progress.completed}/{p.task_progress.total} concluídas</span><span>{Math.round(p.task_progress.completed * 100 / p.task_progress.total)}%</span></div>
                        <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(p.task_progress.completed * 100 / p.task_progress.total)}%` }} /></div>
                        {p.task_progress.overdue > 0 && <span className="mt-1 inline-flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="h-3 w-3" />{p.task_progress.overdue} vencida(s)</span>}
                      </> : <span className="text-xs text-gray-400">Planejamento pendente</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.end_date ? <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-gray-400" />{formatDate(p.end_date)}</span> : 'Sem prazo'}</td>
                    <td className="px-4 py-3 font-medium text-gray-700">{formatCurrency(p.total_budget)}</td>
                    <td className="px-4 py-3 text-gray-600">{p._count.members}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>{data.total} projetos encontrados</span>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >Anterior</button>
                <span className="px-3 py-1">{page} / {data.totalPages}</span>
                <button
                  className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40"
                  disabled={page === data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >Próximo</button>
              </div>
            </div>
          )}
        </>
      )}

      <Modal open={Boolean(activeProject)} onClose={() => setActiveProject(null)} title="Acompanhamento do projeto" size="lg">
        {activeProject && <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
          <div className="rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-medium uppercase tracking-wide text-emerald-700">{activeProject.code || 'Projeto social'}</p><h3 className="mt-1 text-lg font-semibold text-gray-900">{activeProject.name}</h3><p className="mt-1 text-sm text-gray-600">{activeProject.description || 'Registre aqui o andamento, as atividades e os prazos do plano de trabalho.'}</p></div>
              <Badge value={projectStatus} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniMetric label="Atividades" value={`${workspaceTasks.filter((task) => task.status === 'CONCLUIDA').length}/${workspaceTasks.length}`} detail="concluídas" />
              <MiniMetric label="Etapas" value={workspacePhases.length} detail="planejadas" />
              <MiniMetric label="Atrasadas" value={workspaceTasks.filter((task) => task.due_date && new Date(task.due_date) < new Date() && !['CONCLUIDA', 'CANCELADA'].includes(task.status)).length} detail="pedem atenção" alert={workspaceTasks.some((task) => task.due_date && new Date(task.due_date) < new Date() && !['CONCLUIDA', 'CANCELADA'].includes(task.status))} />
              <MiniMetric label="Prazo final" value={activeProject.end_date ? formatDate(activeProject.end_date) : '—'} detail="vigência prevista" />
            </div>
          </div>

          {workspaceError && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{workspaceError}</div>}

          <ProjectManagementPanel projectId={activeProject.id} />

          <section className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3"><h4 className="font-semibold text-gray-900">Situação e orçamento</h4><p className="text-xs text-gray-500">Atualize o status operacional e o orçamento planejado.</p></div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="text-sm text-gray-700">Status<select className="input mt-1 w-full" value={projectStatus} onChange={(event) => setProjectStatus(event.target.value as ProjectStatus)}>{PROJECT_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
              <label className="text-sm text-gray-700">Orçamento previsto (R$)<input className="input mt-1 w-full" type="number" min="0" step="0.01" value={projectBudget} onChange={(event) => setProjectBudget(event.target.value)} placeholder="Não informado" /></label>
              <button className="btn-primary" onClick={saveProjectProgress} disabled={workspaceBusy}>Salvar</button>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex items-start justify-between gap-3"><div><h4 className="font-semibold text-gray-900">Etapas do plano de trabalho</h4><p className="text-xs text-gray-500">Organize a execução por fases com começo e término previstos.</p></div><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{workspacePhases.length} etapa(s)</span></div>
            {workspacePhases.length > 0 && <div className="mb-4 space-y-2">{workspacePhases.map((phase, index) => <div key={phase.id} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-emerald-700">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-gray-800">{phase.name}</p><p className="text-xs text-gray-500">{formatDate(phase.start_date)} – {formatDate(phase.end_date)} · {phase._count?.tasks ?? 0} atividade(s)</p></div><span className="text-xs text-gray-500">{phase.status === 'CONCLUIDA' ? 'Concluída' : phase.status === 'EM_ANDAMENTO' ? 'Em andamento' : 'Não iniciada'}</span></div>)}</div>}
            <form onSubmit={addPhase} className="grid gap-2 sm:grid-cols-[1.3fr_1fr_1fr_auto]">
              <input className="input" value={phaseName} onChange={(event) => setPhaseName(event.target.value)} placeholder="Nova etapa (ex.: mobilização)" minLength={2} required />
              <input className="input" type="date" value={phaseStart} onChange={(event) => setPhaseStart(event.target.value)} aria-label="Início da etapa" />
              <input className="input" type="date" value={phaseEnd} onChange={(event) => setPhaseEnd(event.target.value)} aria-label="Fim da etapa" />
              <button className="btn-secondary flex items-center justify-center gap-1" disabled={workspaceBusy}><Plus className="h-4 w-4" />Etapa</button>
            </form>
          </section>

          <section className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex items-start justify-between gap-3"><div><h4 className="font-semibold text-gray-900">Metas e indicadores de resultado</h4><p className="text-xs text-gray-500">Registre resultados mensuráveis e atualize o valor alcançado para acompanhar o impacto social.</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">{workspaceIndicators.length} indicador(es)</span></div>
            {workspaceIndicators.length > 0 && <div className="mb-4 grid gap-3 md:grid-cols-2">{workspaceIndicators.map((indicator) => {
              const baseline = Number(indicator.baseline ?? 0)
              const target = Number(indicator.target ?? 0)
              const current = indicator.current_value == null ? null : Number(indicator.current_value)
              const progress = current == null ? 0 : target >= baseline ? (target === baseline ? (current >= target ? 100 : 0) : ((current - baseline) / (target - baseline)) * 100) : ((baseline - current) / (baseline - target)) * 100
              const percent = Math.max(0, Math.min(100, Math.round(progress)))
              return <div key={indicator.id} className="rounded-lg bg-gray-50 p-3">
                <div className="flex items-start justify-between gap-2"><div><p className="font-medium text-sm text-gray-800">{indicator.name}</p><p className="mt-0.5 text-xs text-gray-500">Linha de base: {indicator.baseline ?? '—'} · Meta: {indicator.target} {indicator.unit || ''}</p></div>{current != null && <span className="text-xs font-semibold text-emerald-700">{percent}%</span>}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} /></div>
                <div className="mt-3 flex items-end gap-2"><label className="min-w-0 flex-1 text-xs text-gray-500">Resultado atual ({indicator.unit || 'unidade'})<input className="input mt-1 w-full py-1.5" type="number" step="0.01" value={indicatorDrafts[indicator.id] ?? (indicator.current_value == null ? '' : String(indicator.current_value))} onChange={(event) => setIndicatorDrafts((drafts) => ({ ...drafts, [indicator.id]: event.target.value }))} placeholder="Registrar medição" /></label><button className="btn-secondary py-1.5 text-xs" disabled={workspaceBusy || indicatorDrafts[indicator.id] == null || indicatorDrafts[indicator.id] === ''} onClick={() => saveIndicatorValue(indicator)}>Atualizar</button></div>
                {indicator.last_updated && <p className="mt-1 text-[11px] text-gray-400">Última medição: {formatDate(indicator.last_updated)}</p>}
              </div>
            })}</div>}
            <form onSubmit={addIndicator} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_0.9fr_auto]">
              <input className="input" value={indicatorName} onChange={(event) => setIndicatorName(event.target.value)} placeholder="Indicador (ex.: participantes atendidos)" minLength={2} required />
              <input className="input" value={indicatorUnit} onChange={(event) => setIndicatorUnit(event.target.value)} placeholder="Unidade (pessoas)" />
              <input className="input" type="number" step="0.01" value={indicatorBaseline} onChange={(event) => setIndicatorBaseline(event.target.value)} placeholder="Linha de base" aria-label="Linha de base do indicador" />
              <input className="input" type="number" step="0.01" value={indicatorTarget} onChange={(event) => setIndicatorTarget(event.target.value)} placeholder="Meta" aria-label="Meta do indicador" required />
              <select className="input" value={indicatorFrequency} onChange={(event) => setIndicatorFrequency(event.target.value as ProjectIndicator['frequency'])}><option value="MENSAL">Medição mensal</option><option value="TRIMESTRAL">Trimestral</option><option value="ANUAL">Anual</option><option value="SEMANAL">Semanal</option><option value="DIARIO">Diária</option></select>
              <button className="btn-secondary flex items-center justify-center gap-1" disabled={workspaceBusy}><Plus className="h-4 w-4" />Meta</button>
            </form>
          </section>

          <section className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex items-start justify-between gap-3"><div><h4 className="font-semibold text-gray-900">Atividades e entregas</h4><p className="text-xs text-gray-500">Acompanhe responsáveis, prioridade e prazo de cada ação.</p></div><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{workspaceTasks.length} atividade(s)</span></div>
            <form onSubmit={addTask} className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
              <input className="input" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Nova atividade ou entrega" minLength={2} required />
              <select className="input" value={taskPhaseId} onChange={(event) => setTaskPhaseId(event.target.value)}><option value="">Sem etapa vinculada</option>{workspacePhases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}</select>
              <input className="input" type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} aria-label="Prazo da atividade" />
              <select className="input" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as ProjectTask['priority'])}>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <button className="btn-primary flex items-center justify-center gap-1" disabled={workspaceBusy}><Plus className="h-4 w-4" />Adicionar</button>
            </form>
            {workspaceBusy && workspaceTasks.length === 0 ? <p className="py-5 text-center text-sm text-gray-500">Carregando acompanhamento...</p> : workspaceTasks.length === 0 ? <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Ainda não há atividades registradas. Comece cadastrando as ações previstas no plano de trabalho.</div> : (
              <div className="divide-y divide-gray-100">{workspaceTasks.map((task) => <div key={task.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1"><p className="font-medium text-sm text-gray-800">{task.title}</p><p className="mt-0.5 text-xs text-gray-500">{task.phase?.name || 'Sem etapa'} · {PRIORITY_LABELS[task.priority]} · Prazo: {formatDate(task.due_date)}</p></div>
                <select className="input w-40 py-1.5 text-xs" value={task.status} disabled={workspaceBusy} onChange={(event) => updateTaskStatus(task, event.target.value as ProjectTask['status'])}>{Object.entries(TASK_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                {task.status === 'CONCLUIDA' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              </div>)}</div>
            )}
          </section>

          <p className="text-xs leading-relaxed text-gray-500">Boa prática de gestão social: vincule cada atividade a uma etapa, prazo e evidência de entrega. Metas e resultados devem refletir o plano de trabalho pactuado; este painel ajuda no acompanhamento, mas não substitui a prestação de contas oficial.</p>
        </div>}
      </Modal>

      {/* Modal Criar Projeto */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); reset() }} title="Novo projeto">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {submitError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{submitError}</div>
          )}
          <div>
            <label className="label">Nome do projeto *</label>
            <input className="input" placeholder="Ex: Projeto Arte na Escola" {...register('name')} />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo *</label>
              <select className="input" {...register('type')}>
                <option value="">Selecione...</option>
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
              {errors.type && <p className="text-xs text-red-500 mt-1">{errors.type.message}</p>}
            </div>
            <div>
              <label className="label">Código (opcional)</label>
              <input className="input" placeholder="Ex: PROJ-001" {...register('code')} />
            </div>
          </div>

          <div>
            <label className="label">Objetivo e público beneficiário</label>
            <textarea className="input resize-none h-24" placeholder="Qual necessidade social será atendida? Quem será beneficiado e que mudança se espera alcançar?" {...register('description')} />
            <p className="mt-1 text-xs text-gray-500">Descreva o problema, o público atendido e o resultado esperado. Depois, organize a execução em etapas e atividades.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Data de início</label>
              <input type="date" className="input" {...register('start_date')} />
            </div>
            <div>
              <label className="label">Data de término</label>
              <input type="date" className="input" {...register('end_date')} />
            </div>
          </div>

          <div>
            <label className="label">Orçamento total (R$)</label>
            <input
              type="number"
              step="0.01"
              className="input"
              placeholder="0,00"
              {...register('total_budget')}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => { setModalOpen(false); reset() }}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Criar projeto'}
            </button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  )
}

function SummaryCard({ label, value, icon, tone = 'gray' }: { label: string; value: string | number; icon: ReactNode; tone?: 'gray' | 'blue' | 'amber' | 'red' | 'green' }) {
  const tones = {
    gray: 'bg-white text-slate-600',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    green: 'bg-emerald-50 text-emerald-700',
  }
  return <div className="card flex items-center gap-3 p-4"><div className={`rounded-xl p-2.5 ${tones[tone]}`}>{icon}</div><div className="min-w-0"><p className="truncate text-xs text-gray-500">{label}</p><p className="mt-0.5 truncate text-lg font-semibold text-gray-900">{value}</p></div></div>
}

function MiniMetric({ label, value, detail, alert = false }: { label: string; value: string | number; detail: string; alert?: boolean }) {
  return <div className={`rounded-lg p-3 ${alert ? 'bg-red-50' : 'bg-white/80'}`}><p className="text-xs text-gray-500">{label}</p><p className={`mt-1 text-base font-semibold ${alert ? 'text-red-700' : 'text-gray-900'}`}>{value}</p><p className="text-[11px] text-gray-500">{detail}</p></div>
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  if (!ctx.req.cookies['refresh_token']) {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}
