import {
  cloneElement,
  useId,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useSWR, { mutate as mutateCache } from 'swr'
import axios from 'axios'
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Target,
  UsersRound,
  X,
  AlertTriangle,
  UserRound,
  CircleDollarSign,
} from 'lucide-react'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { ProjectManagementPanel } from './ProjectManagementPanel'
import { ProjectFundingPanel } from './ProjectFundingPanel'
import {
  projectsService,
  type ProjectDetails,
  type ProjectIndicator,
  type ProjectMember,
  type ProjectStatus,
  type ProjectTask,
  type ProjectType,
} from '@/services/projects'
import {
  TYPE_LABELS,
  STATUS_LABELS,
  TASK_STATUS_LABELS,
  PRIORITY_LABELS,
  formatCurrency,
  formatDate,
  isOverdue,
  projectError,
} from './project-utils'

const SECTIONS = [
  { id: 'resumo', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'planejamento', label: 'Plano de trabalho', icon: ListTodo },
  { id: 'alunos', label: 'Alunos e turmas', icon: UsersRound },
  { id: 'chamada', label: 'Chamada', icon: CalendarCheck2 },
  { id: 'rotina', label: 'Rotina', icon: ClipboardList },
  { id: 'metas', label: 'Metas e resultados', icon: Target },
  { id: 'equipe', label: 'Equipe', icon: UserRound },
  { id: 'dados', label: 'Dados do projeto', icon: Settings2 },
] as const
type Section = (typeof SECTIONS)[number]['id']
const MEMBER_ROLES: Record<ProjectMember['role'], string> = {
  GESTOR: 'Gestor',
  COORDENADOR: 'Coordenador',
  COLABORADOR: 'Colaborador',
  VOLUNTARIO: 'Voluntário',
}
type UserOption = { id: string; name: string; email: string; status: string }

export default function ProjectWorkspace({
  projectId,
  tenant,
}: {
  projectId: string
  tenant: string
}) {
  const router = useRouter()
  const { user } = useAuthStore()
  const can = (permission: string) =>
    Boolean(user?.permissions?.some((item) => item === '*' || item === permission))
  const canEdit = can('projects:update')
  const activeSection: Section =
    SECTIONS.find((section) => section.id === router.query.aba)?.id ?? 'resumo'
  const projectQuery = useSWR(['project', tenant, projectId], () => projectsService.get(projectId))
  const project = projectQuery.data
  const tasksQuery = useSWR(project ? ['project-tasks', tenant, projectId] : null, () =>
    projectsService.tasks(projectId),
  )
  const phasesQuery = useSWR(project ? ['project-phases', tenant, projectId] : null, () =>
    projectsService.phases(projectId),
  )
  const indicatorsQuery = useSWR(project ? ['project-indicators', tenant, projectId] : null, () =>
    projectsService.indicators(projectId),
  )
  const managementQuery = useSWR(project ? ['project-management', projectId] : null, () =>
    projectsService.management(projectId),
  )
  const usersQuery = useSWR<UserOption[]>(
    activeSection === 'equipe' && canEdit && can('users:read') ? ['project-users', tenant] : null,
    () => api.get('/users').then((response) => response.data),
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [phaseName, setPhaseName] = useState('')
  const [phaseStart, setPhaseStart] = useState('')
  const [phaseEnd, setPhaseEnd] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskPhase, setTaskPhase] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskPriority, setTaskPriority] = useState<ProjectTask['priority']>('MEDIA')
  const [taskSearch, setTaskSearch] = useState('')
  const [taskFilter, setTaskFilter] = useState('')
  const [indicatorName, setIndicatorName] = useState('')
  const [indicatorUnit, setIndicatorUnit] = useState('')
  const [indicatorBaseline, setIndicatorBaseline] = useState('')
  const [indicatorTarget, setIndicatorTarget] = useState('')
  const [indicatorFrequency, setIndicatorFrequency] =
    useState<ProjectIndicator['frequency']>('MENSAL')
  const [indicatorDrafts, setIndicatorDrafts] = useState<Record<string, string>>({})
  const [memberId, setMemberId] = useState('')
  const [memberRole, setMemberRole] = useState<ProjectMember['role']>('COLABORADOR')
  const [removingMember, setRemovingMember] = useState<string | null>(null)
  const tasks = tasksQuery.data ?? []
  const phases = phasesQuery.data ?? []
  const indicators = indicatorsQuery.data ?? []
  const pendingTasks = tasks.filter((task) => !['CONCLUIDA', 'CANCELADA'].includes(task.status))
  const overdueTasks = tasks.filter(isOverdue)
  const completedTasks = tasks.filter((task) => task.status === 'CONCLUIDA').length
  const totalTasks = tasks.filter((task) => task.status !== 'CANCELADA').length
  const progress = totalTasks ? Math.round((completedTasks * 100) / totalTasks) : 0
  const filteredTasks = tasks.filter(
    (task) =>
      task.title.toLocaleLowerCase('pt-BR').includes(taskSearch.toLocaleLowerCase('pt-BR')) &&
      (!taskFilter || (taskFilter === 'atrasadas' ? isOverdue(task) : task.status === taskFilter)),
  )
  const nextTasks = [...pendingTasks]
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
    .slice(0, 5)
  const planningReady =
    Boolean(tasksQuery.data && phasesQuery.data) && !tasksQuery.error && !phasesQuery.error

  const sectionHref = (section: Section) => ({
    pathname: '/[tenant]/projetos/[projectId]',
    query: { tenant, projectId, aba: section },
  })

  async function refreshData() {
    await Promise.all([
      projectQuery.mutate(),
      tasksQuery.mutate(),
      phasesQuery.mutate(),
      indicatorsQuery.mutate(),
      managementQuery.mutate(),
      mutateCache(
        (key) => key === '/projects/overview' || (Array.isArray(key) && key[0] === '/projects'),
      ),
    ])
  }

  async function perform(action: () => Promise<unknown>, message: string) {
    if (!canEdit || busy) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await action()
      setSuccess(message)
      await refreshData()
    } catch (cause) {
      setError(projectError(cause))
    } finally {
      setBusy(false)
    }
  }

  async function addPhase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (phaseStart && phaseEnd && phaseEnd < phaseStart) {
      setError('O término da etapa deve ser igual ou posterior ao início.')
      return
    }
    await perform(async () => {
      await projectsService.createPhase(projectId, {
        name: phaseName.trim(),
        order: phases.length ? Math.max(...phases.map((phase) => phase.order)) + 1 : 0,
        ...(phaseStart && { start_date: phaseStart }),
        ...(phaseEnd && { end_date: phaseEnd }),
      })
      setPhaseName('')
      setPhaseStart('')
      setPhaseEnd('')
    }, 'Etapa adicionada ao plano de trabalho.')
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await perform(async () => {
      await projectsService.createTask(projectId, {
        title: taskTitle.trim(),
        priority: taskPriority,
        ...(taskPhase && { phase_id: taskPhase }),
        ...(taskAssignee && { assigned_to: taskAssignee }),
        ...(taskDue && { due_date: new Date(`${taskDue}T12:00:00`).toISOString() }),
      })
      setTaskTitle('')
      setTaskDue('')
      setTaskAssignee('')
    }, 'Atividade adicionada.')
  }

  async function addIndicator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await perform(async () => {
      await projectsService.createIndicator(projectId, {
        name: indicatorName.trim(),
        target: Number(indicatorTarget),
        frequency: indicatorFrequency,
        ...(indicatorUnit.trim() && { unit: indicatorUnit.trim() }),
        ...(indicatorBaseline !== '' && { baseline: Number(indicatorBaseline) }),
      })
      setIndicatorName('')
      setIndicatorUnit('')
      setIndicatorTarget('')
      setIndicatorBaseline('')
    }, 'Meta cadastrada.')
  }

  async function saveIndicator(indicator: ProjectIndicator) {
    const value = indicatorDrafts[indicator.id]
    if (value == null || value.trim() === '' || !Number.isFinite(Number(value))) {
      setError('Informe uma medição válida.')
      return
    }
    await perform(async () => {
      await projectsService.updateIndicator(projectId, indicator.id, Number(value))
      setIndicatorDrafts((current) => {
        const next = { ...current }
        delete next[indicator.id]
        return next
      })
    }, 'Resultado atualizado.')
  }

  if (projectQuery.isLoading) return <PageSpinner />
  if (!project || projectQuery.error) {
    const unavailable =
      axios.isAxiosError(projectQuery.error) &&
      [403, 404].includes(projectQuery.error.response?.status ?? 0)
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <FolderKanban className="mx-auto h-10 w-10 text-brand-600" />
        <h1 className="mt-4 text-xl font-semibold text-gray-900">
          {unavailable ? 'Projeto indisponível' : 'Não foi possível abrir o projeto'}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {unavailable
            ? 'Este projeto não foi encontrado ou seu perfil não tem acesso.'
            : 'Confira sua conexão e tente novamente.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/${tenant}/projetos`} className="btn-secondary">
            Voltar para projetos
          </Link>
          {!unavailable && (
            <button className="btn-primary" onClick={() => projectQuery.mutate()}>
              Tentar novamente
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <Head>
        <title>{project.name} | Projetos | Amparo GOV</title>
      </Head>
      <Link
        href={`/${tenant}/projetos`}
        className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Todos os projetos
      </Link>

      <header className="overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <div className="h-1 bg-brand-600" />
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                  {project.code || 'Projeto social'}
                </span>
                <span className="text-gray-300">/</span>
                <span className="text-xs text-gray-500">{TYPE_LABELS[project.type]}</span>
                <Badge value={project.status} />
              </div>
              <h1 className="break-words text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">
                {project.name}
              </h1>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  {formatDate(project.start_date)} — {formatDate(project.end_date)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="h-4 w-4" />
                  {project.manager?.name ||
                    project.members.find((member) => member.role === 'GESTOR')?.user.name ||
                    'Gestor não definido'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-label="Atualizar dados do projeto"
                className="btn-secondary inline-flex items-center gap-2"
                disabled={busy || projectQuery.isValidating}
                onClick={() => {
                  void refreshData()
                }}
              >
                <RefreshCw
                  className={`h-4 w-4 ${projectQuery.isValidating ? 'animate-spin' : ''}`}
                />
                Atualizar
              </button>
              {canEdit && (
                <Link
                  href={sectionHref('dados')}
                  shallow
                  scroll={false}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Settings2 className="h-4 w-4" />
                  Editar projeto
                </Link>
              )}
            </div>
          </div>
        </div>
        <nav
          aria-label="Seções do projeto"
          className="flex flex-wrap gap-1 border-t border-gray-100 bg-gray-50/70 p-2 sm:px-4"
        >
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <Link
              key={id}
              href={sectionHref(id)}
              shallow
              scroll={false}
              aria-current={activeSection === id ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 ${activeSection === id ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white hover:text-brand-800'}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </header>

      {user && !canEdit && (
        <p className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          Você está visualizando este projeto. Seu perfil possui acesso de consulta.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Fechar aviso de erro">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      {success && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </span>
          <button onClick={() => setSuccess('')} aria-label="Fechar confirmação">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {activeSection === 'resumo' && (
        <div className="space-y-5">
          <ProjectFundingPanel project={project} tenant={tenant} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Execução das atividades"
              value={tasksQuery.data && !tasksQuery.error ? `${progress}%` : '—'}
              detail={`${completedTasks} de ${totalTasks} concluídas`}
              icon={<ListTodo />}
            />
            <Metric
              label="Precisam de atenção"
              value={tasksQuery.data && !tasksQuery.error ? overdueTasks.length : '—'}
              detail="Atividades com prazo vencido"
              icon={<AlertTriangle />}
              warning={overdueTasks.length > 0}
            />
            <Metric
              label="Alunos vinculados"
              value={
                managementQuery.data && !managementQuery.error
                  ? managementQuery.data.summary.students
                  : '—'
              }
              detail={
                managementQuery.data
                  ? `${managementQuery.data.summary.classes} turmas no projeto`
                  : 'Carregando turmas'
              }
              icon={<UsersRound />}
            />
            <Metric
              label="Orçamento planejado"
              value={formatCurrency(project.total_budget)}
              detail={`Aprovado: ${formatCurrency(project.approved_budget)}`}
              icon={<CircleDollarSign />}
            />
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <section className="card min-w-0 p-5 sm:p-6">
              <SectionHeading
                title="Próximas entregas"
                description="As atividades em aberto, organizadas por prazo."
              />
              <QueryState
                loading={tasksQuery.isLoading}
                error={tasksQuery.error}
                retry={() => tasksQuery.mutate()}
              />
              {tasksQuery.data &&
                !tasksQuery.error &&
                (nextTasks.length ? (
                  <div className="divide-y divide-gray-100">
                    {nextTasks.map((task) => (
                      <div key={task.id} className="flex items-start justify-between gap-3 py-4">
                        <div className="min-w-0">
                          <p className="break-words font-medium text-gray-900">{task.title}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {task.assignee?.name || 'Sem responsável'} ·{' '}
                            {task.phase?.name || 'Sem etapa'}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium ${isOverdue(task) ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-700'}`}
                        >
                          {formatDate(task.due_date)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="Nenhuma atividade pendente. Organize as próximas entregas no plano de trabalho." />
                ))}
              <Link
                href={sectionHref('planejamento')}
                shallow
                scroll={false}
                className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-700"
              >
                Abrir plano de trabalho
                <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
            <section className="card min-w-0 p-5 sm:p-6">
              <SectionHeading
                title="Sobre o projeto"
                description="Objetivo, público e acompanhamento."
              />
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-600">
                {project.description ||
                  'O objetivo e o público atendido ainda não foram descritos. Preencha os dados do projeto para orientar a equipe.'}
              </p>
              <dl className="mt-5 space-y-3 border-t border-gray-100 pt-5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Equipe</dt>
                  <dd className="font-medium">{project.members.length} integrantes</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Etapas planejadas</dt>
                  <dd className="font-medium">
                    {phasesQuery.data && !phasesQuery.error ? phases.length : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Metas cadastradas</dt>
                  <dd className="font-medium">
                    {indicatorsQuery.data && !indicatorsQuery.error ? indicators.length : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Atualização do cadastro</dt>
                  <dd>{formatDate(project.updated_at)}</dd>
                </div>
              </dl>
            </section>
          </div>
          {(managementQuery.error || phasesQuery.error || indicatorsQuery.error) && (
            <QueryState
              error={managementQuery.error || phasesQuery.error || indicatorsQuery.error}
              retry={refreshData}
            />
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                {
                  section: 'alunos',
                  title: 'Organizar atendimento',
                  text: 'Vincule alunos e distribua as turmas.',
                  icon: UsersRound,
                },
                {
                  section: 'chamada',
                  title: 'Registrar presença',
                  text: 'Faça a chamada por turma e data.',
                  icon: CalendarCheck2,
                },
                {
                  section: 'metas',
                  title: 'Acompanhar resultados',
                  text: 'Atualize os indicadores do projeto.',
                  icon: Target,
                },
              ] as const
            ).map(({ section, title, text, icon: Icon }) => (
              <Link
                key={section}
                href={sectionHref(section)}
                shallow
                scroll={false}
                className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-brand-300 hover:bg-brand-50"
              >
                <Icon className="mt-1 h-5 w-5 shrink-0 text-brand-600" />
                <div>
                  <p className="font-semibold text-brand-900">{title}</p>
                  <p className="mt-1 text-sm text-gray-500">{text}</p>
                </div>
                <ArrowRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-brand-600" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'planejamento' && (
        <div className="space-y-5">
          <QueryState
            loading={tasksQuery.isLoading || phasesQuery.isLoading}
            error={tasksQuery.error || phasesQuery.error}
            retry={refreshData}
          />
          <section className="card min-w-0 p-5 sm:p-6">
            <SectionHeading
              title="Etapas do plano de trabalho"
              description="Organize a execução em fases com início e término previstos."
              count={phases.length}
            />
            {phases.length ? (
              <ol className="mb-5 grid gap-3 md:grid-cols-2">
                {phases.map((phase, index) => (
                  <li
                    key={phase.id}
                    className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-gray-800">{phase.name}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatDate(phase.start_date)} — {formatDate(phase.end_date)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {phase._count?.tasks ?? 0} atividades
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              planningReady && (
                <EmptyState text="Nenhuma etapa cadastrada. Comece organizando as fases do projeto." />
              )
            )}
            {canEdit && (
              <form onSubmit={addPhase}>
                <fieldset
                  disabled={busy || !planningReady}
                  className="mt-4 grid gap-3 rounded-xl bg-brand-50 p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_1fr_1fr_auto] xl:items-end"
                >
                  <Field label="Nome da etapa">
                    <input
                      className="input w-full"
                      value={phaseName}
                      onChange={(event) => setPhaseName(event.target.value)}
                      minLength={2}
                      required
                      placeholder="Ex.: Mobilização"
                    />
                  </Field>
                  <Field label="Início previsto">
                    <input
                      className="input w-full"
                      type="date"
                      value={phaseStart}
                      onChange={(event) => setPhaseStart(event.target.value)}
                    />
                  </Field>
                  <Field label="Término previsto">
                    <input
                      className="input w-full"
                      type="date"
                      min={phaseStart || undefined}
                      value={phaseEnd}
                      onChange={(event) => setPhaseEnd(event.target.value)}
                    />
                  </Field>
                  <button className="btn-secondary inline-flex items-center justify-center gap-2">
                    <Plus className="h-4 w-4" />
                    Adicionar etapa
                  </button>
                </fieldset>
              </form>
            )}
          </section>
          <section className="card min-w-0 p-5 sm:p-6">
            <SectionHeading
              title="Atividades e entregas"
              description="Defina responsáveis, prioridades e prazos; atualize o andamento conforme a execução."
              count={tasks.length}
            />
            {canEdit && (
              <form onSubmit={addTask}>
                <fieldset
                  disabled={busy || !planningReady}
                  className="mb-6 grid gap-3 rounded-xl bg-brand-50 p-4 md:grid-cols-2 xl:grid-cols-3"
                >
                  <Field label="Atividade ou entrega">
                    <input
                      className="input w-full"
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      minLength={2}
                      required
                      placeholder="O que precisa ser feito?"
                    />
                  </Field>
                  <Field label="Etapa">
                    <select
                      className="input w-full"
                      value={taskPhase}
                      onChange={(event) => setTaskPhase(event.target.value)}
                    >
                      <option value="">Sem etapa</option>
                      {phases.map((phase) => (
                        <option key={phase.id} value={phase.id}>
                          {phase.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Responsável">
                    <select
                      className="input w-full"
                      value={taskAssignee}
                      onChange={(event) => setTaskAssignee(event.target.value)}
                    >
                      <option value="">Definir depois</option>
                      {project.members.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.user.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Prazo">
                    <input
                      className="input w-full"
                      type="date"
                      value={taskDue}
                      onChange={(event) => setTaskDue(event.target.value)}
                    />
                  </Field>
                  <Field label="Prioridade">
                    <select
                      className="input w-full"
                      value={taskPriority}
                      onChange={(event) =>
                        setTaskPriority(event.target.value as ProjectTask['priority'])
                      }
                    >
                      {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button className="btn-primary inline-flex items-center justify-center gap-2 self-end">
                    <Plus className="h-4 w-4" />
                    Adicionar atividade
                  </button>
                </fieldset>
              </form>
            )}
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <label className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  aria-label="Buscar atividade"
                  className="input w-full pl-9"
                  value={taskSearch}
                  onChange={(event) => setTaskSearch(event.target.value)}
                  placeholder="Buscar atividade..."
                />
              </label>
              <select
                aria-label="Filtrar atividades por situação"
                className="input w-full sm:w-52"
                value={taskFilter}
                onChange={(event) => setTaskFilter(event.target.value)}
              >
                <option value="">Todas as situações</option>
                <option value="atrasadas">Prazo vencido</option>
                {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="divide-y divide-gray-100">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:flex-wrap sm:items-start"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-gray-800">{task.title}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {task.phase?.name || 'Sem etapa'} · {task.assignee?.name || 'Sem responsável'}{' '}
                      · Prioridade {PRIORITY_LABELS[task.priority].toLowerCase()}
                    </p>
                    <p
                      className={`mt-2 inline-flex items-center gap-1 text-xs ${isOverdue(task) ? 'font-semibold text-red-700' : 'text-gray-500'}`}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(task.due_date)}
                      {isOverdue(task) ? ' · Prazo vencido' : ''}
                    </p>
                  </div>
                  <select
                    aria-label={`Situação de ${task.title}`}
                    className="input w-full sm:w-44"
                    value={task.status}
                    disabled={busy || !canEdit}
                    onChange={(event) => {
                      void perform(
                        () =>
                          projectsService.updateTask(projectId, task.id, {
                            status: event.target.value as ProjectTask['status'],
                          }),
                        'Situação da atividade atualizada.',
                      )
                    }}
                  >
                    {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {planningReady && !filteredTasks.length && (
              <EmptyState
                text={
                  tasks.length
                    ? 'Nenhuma atividade corresponde aos filtros selecionados.'
                    : 'Nenhuma atividade cadastrada. Adicione a primeira entrega do projeto.'
                }
              />
            )}
          </section>
        </div>
      )}

      {(['alunos', 'chamada', 'rotina'] as Section[]).includes(activeSection) && (
        <ProjectManagementPanel
          projectId={projectId}
          canEdit={canEdit}
          onChange={refreshData}
          section={
            activeSection === 'chamada'
              ? 'attendance'
              : activeSection === 'rotina'
                ? 'routine'
                : 'students'
          }
        />
      )}

      {activeSection === 'metas' && (
        <section className="card min-w-0 p-5 sm:p-6">
          <SectionHeading
            title="Metas e resultados"
            description="Defina a linha de base e a meta; registre as medições para acompanhar o impacto."
            count={indicators.length}
          />
          <QueryState
            loading={indicatorsQuery.isLoading}
            error={indicatorsQuery.error}
            retry={() => indicatorsQuery.mutate()}
          />
          {indicators.length > 0 && (
            <div className="mb-6 grid gap-4 md:grid-cols-2">
              {indicators.map((indicator) => {
                const baseline = Number(indicator.baseline ?? 0)
                const target = Number(indicator.target ?? 0)
                const current =
                  indicator.current_value == null ? null : Number(indicator.current_value)
                const rawProgress =
                  current == null
                    ? 0
                    : target === baseline
                      ? current >= target
                        ? 100
                        : 0
                      : ((current - baseline) / (target - baseline)) * 100
                const percent = Math.max(0, Math.min(100, Math.round(rawProgress)))
                return (
                  <div key={indicator.id} className="rounded-xl border border-gray-200 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words font-semibold text-gray-900">
                          {indicator.name}
                        </h3>
                        <p className="mt-1 text-xs text-gray-500">
                          Linha de base: {indicator.baseline ?? '—'} · Meta:{' '}
                          {indicator.target ?? '—'} {indicator.unit}
                        </p>
                      </div>
                      <span className="rounded-lg bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-700">
                        {current == null ? 'Sem medição' : `${percent}%`}
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`Progresso de ${indicator.name}`}
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100"
                    >
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap items-end gap-2">
                      <Field label={`Resultado atual (${indicator.unit || 'unidade'})`}>
                        <input
                          className="input w-full"
                          type="number"
                          step="any"
                          disabled={!canEdit || busy}
                          value={
                            indicatorDrafts[indicator.id] ??
                            (indicator.current_value == null ? '' : String(indicator.current_value))
                          }
                          onChange={(event) =>
                            setIndicatorDrafts((currentDrafts) => ({
                              ...currentDrafts,
                              [indicator.id]: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      {canEdit && (
                        <button
                          className="btn-secondary"
                          disabled={
                            busy ||
                            indicatorDrafts[indicator.id] == null ||
                            indicatorDrafts[indicator.id] === ''
                          }
                          onClick={() => saveIndicator(indicator)}
                        >
                          Salvar medição
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      Última medição: {formatDate(indicator.last_updated)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
          {!indicators.length && indicatorsQuery.data && !indicatorsQuery.error && (
            <EmptyState text="Nenhuma meta cadastrada. Defina o primeiro resultado esperado para este projeto." />
          )}
          {canEdit && (
            <form onSubmit={addIndicator}>
              <fieldset
                disabled={busy || !indicatorsQuery.data || Boolean(indicatorsQuery.error)}
                className="mt-5 grid gap-3 rounded-xl bg-brand-50 p-4 md:grid-cols-2 xl:grid-cols-3"
              >
                <Field label="Nome do indicador">
                  <input
                    className="input w-full"
                    value={indicatorName}
                    onChange={(event) => setIndicatorName(event.target.value)}
                    required
                    minLength={2}
                    placeholder="Ex.: Participantes atendidos"
                  />
                </Field>
                <Field label="Unidade">
                  <input
                    className="input w-full"
                    value={indicatorUnit}
                    onChange={(event) => setIndicatorUnit(event.target.value)}
                    placeholder="Ex.: pessoas"
                  />
                </Field>
                <Field label="Linha de base">
                  <input
                    className="input w-full"
                    type="number"
                    step="any"
                    value={indicatorBaseline}
                    onChange={(event) => setIndicatorBaseline(event.target.value)}
                  />
                </Field>
                <Field label="Meta esperada">
                  <input
                    className="input w-full"
                    type="number"
                    step="any"
                    required
                    value={indicatorTarget}
                    onChange={(event) => setIndicatorTarget(event.target.value)}
                  />
                </Field>
                <Field label="Frequência de medição">
                  <select
                    className="input w-full"
                    value={indicatorFrequency}
                    onChange={(event) =>
                      setIndicatorFrequency(event.target.value as ProjectIndicator['frequency'])
                    }
                  >
                    <option value="DIARIO">Diária</option>
                    <option value="SEMANAL">Semanal</option>
                    <option value="MENSAL">Mensal</option>
                    <option value="TRIMESTRAL">Trimestral</option>
                    <option value="ANUAL">Anual</option>
                  </select>
                </Field>
                <button className="btn-primary inline-flex items-center justify-center gap-2 self-end">
                  <Plus className="h-4 w-4" />
                  Cadastrar meta
                </button>
              </fieldset>
            </form>
          )}
        </section>
      )}

      {activeSection === 'equipe' && (
        <section className="card min-w-0 p-5 sm:p-6">
          <SectionHeading
            title="Equipe do projeto"
            description="Organize quem participa da execução e suas funções no projeto."
            count={project.members.length}
          />
          {canEdit && can('users:read') && (
            <>
              <QueryState
                loading={usersQuery.isLoading}
                error={usersQuery.error}
                retry={() => usersQuery.mutate()}
              />
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void perform(async () => {
                    await projectsService.addMember(projectId, memberId, memberRole)
                    setMemberId('')
                  }, 'Integrante adicionado à equipe.')
                }}
              >
                <fieldset
                  disabled={busy || !usersQuery.data || Boolean(usersQuery.error)}
                  className="mb-5 grid gap-3 rounded-xl bg-brand-50 p-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end"
                >
                  <Field label="Usuário da organização">
                    <select
                      className="input w-full"
                      required
                      value={memberId}
                      onChange={(event) => setMemberId(event.target.value)}
                    >
                      <option value="">Selecione um usuário</option>
                      {usersQuery.data
                        ?.filter(
                          (candidate) =>
                            candidate.status === 'ACTIVE' &&
                            !project.members.some((member) => member.user_id === candidate.id),
                        )
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name} — {candidate.email}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Função no projeto">
                    <select
                      className="input w-full"
                      value={memberRole}
                      onChange={(event) =>
                        setMemberRole(event.target.value as ProjectMember['role'])
                      }
                    >
                      {Object.entries(MEMBER_ROLES).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button className="btn-primary" disabled={!memberId}>
                    Adicionar integrante
                  </button>
                </fieldset>
              </form>
            </>
          )}
          {canEdit && !can('users:read') && (
            <p className="mb-4 text-sm text-gray-500">
              A inclusão de integrantes exige acesso à lista de usuários da organização.
            </p>
          )}
          <div className="divide-y divide-gray-100">
            {project.members.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold text-brand-700">
                    {member.user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="break-words font-medium text-gray-900">{member.user.name}</p>
                    <p className="break-all text-xs text-gray-500">{member.user.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                    {MEMBER_ROLES[member.role]}
                  </span>
                  {canEdit &&
                    (removingMember === member.user_id ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span>Remover da equipe?</span>
                        <button
                          className="font-semibold text-red-700"
                          disabled={busy}
                          onClick={() => {
                            void perform(async () => {
                              await projectsService.removeMember(projectId, member.user_id)
                              setRemovingMember(null)
                            }, 'Integrante removido da equipe do projeto.')
                          }}
                        >
                          Confirmar
                        </button>
                        <button className="text-gray-600" onClick={() => setRemovingMember(null)}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        className="text-xs font-medium text-gray-500 hover:text-red-700"
                        disabled={busy}
                        onClick={() => setRemovingMember(member.user_id)}
                      >
                        Remover
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
          {!project.members.length && <EmptyState text="Nenhum integrante vinculado ao projeto." />}
        </section>
      )}

      {activeSection === 'dados' && (
        <ProjectDataForm
          key={project.updated_at}
          project={project}
          canEdit={canEdit}
          busy={busy}
          onSave={(dto) =>
            perform(() => projectsService.update(projectId, dto), 'Dados do projeto salvos.')
          }
        />
      )}
    </div>
  )
}

function ProjectDataForm({
  project,
  canEdit,
  busy,
  onSave,
}: {
  project: ProjectDetails
  canEdit: boolean
  busy: boolean
  onSave: (dto: Parameters<typeof projectsService.update>[1]) => Promise<void>
}) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [code, setCode] = useState(project.code ?? '')
  const [type, setType] = useState<ProjectType>(project.type)
  const [status, setStatus] = useState<ProjectStatus>(project.status)
  const [start, setStart] = useState(project.start_date?.slice(0, 10) ?? '')
  const [end, setEnd] = useState(project.end_date?.slice(0, 10) ?? '')
  const [budget, setBudget] = useState(
    project.total_budget == null ? '' : String(project.total_budget),
  )
  const [formError, setFormError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    if (name.trim().length < 2) {
      setFormError('Informe um nome com pelo menos dois caracteres.')
      return
    }
    if (start && end && end < start) {
      setFormError('O término deve ser igual ou posterior ao início.')
      return
    }
    if (budget !== '' && (!Number.isFinite(Number(budget)) || Number(budget) < 0)) {
      setFormError('Informe um orçamento válido.')
      return
    }
    await onSave({
      name: name.trim(),
      description: description.trim(),
      code: code.trim(),
      type,
      status,
      ...(start && { start_date: start }),
      ...(end && { end_date: end }),
      ...(budget !== '' && { total_budget: Number(budget) }),
    })
  }
  return (
    <section className="card p-5 sm:p-6">
      <SectionHeading
        title="Dados do projeto"
        description="Mantenha o objetivo, a situação, a vigência e o orçamento atualizados."
      />
      {formError && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {formError}
        </p>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={!canEdit || busy} className="grid gap-5 md:grid-cols-2">
          <Field label="Nome do projeto *">
            <input
              className="input w-full"
              minLength={2}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Código">
            <input
              className="input w-full"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <Field label="Área de atuação">
            <select
              className="input w-full"
              value={type}
              onChange={(event) => setType(event.target.value as ProjectType)}
            >
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Situação do projeto">
            <select
              className="input w-full"
              value={status}
              onChange={(event) => setStatus(event.target.value as ProjectStatus)}
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <label className="block text-sm font-medium text-gray-700 md:col-span-2">
            Objetivo e público beneficiário
            <textarea
              className="input mt-1.5 min-h-[140px] w-full resize-y"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descreva o objetivo, o público atendido e os resultados esperados."
            />
          </label>
          <Field label="Data de início">
            <input
              className="input w-full"
              type="date"
              required={Boolean(project.start_date)}
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </Field>
          <Field label="Data de término">
            <input
              className="input w-full"
              type="date"
              required={Boolean(project.end_date)}
              min={start || undefined}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </Field>
          <Field label="Orçamento planejado (R$)">
            <input
              className="input w-full"
              type="number"
              min="0"
              step="0.01"
              required={project.total_budget != null}
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              placeholder="Não informado"
            />
          </Field>
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-xs text-gray-500">Orçamento aprovado</p>
            <p className="mt-1 font-semibold text-gray-800">
              {formatCurrency(project.approved_budget)}
            </p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5 md:col-span-2">
              <p className="text-sm text-gray-500">As alterações são aplicadas ao salvar.</p>
              <button className="btn-primary" type="submit">
                {busy ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          )}
        </fieldset>
      </form>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const generatedId = useId()
  const id = children.props.id ?? generatedId
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="mt-1.5">{cloneElement(children, { id })}</div>
    </div>
  )
}
function SectionHeading({
  title,
  description,
  count,
}: {
  title: string
  description: string
  count?: number
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-brand-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      {count != null && (
        <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">
          {count}
        </span>
      )}
    </div>
  )
}
function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
      {text}
    </p>
  )
}
function QueryState({
  loading,
  error,
  retry,
}: {
  loading?: boolean
  error?: unknown
  retry: () => Promise<unknown>
}) {
  if (error)
    return (
      <div
        role="alert"
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      >
        <p>Não foi possível carregar esta área. Os dados não estão disponíveis.</p>
        <button
          className="font-semibold underline"
          onClick={() => {
            void retry()
          }}
        >
          Tentar novamente
        </button>
      </div>
    )
  return loading ? (
    <p role="status" className="py-4 text-sm text-gray-500">
      Carregando dados do projeto...
    </p>
  ) : null
}
function Metric({
  label,
  value,
  detail,
  icon,
  warning,
}: {
  label: string
  value: string | number
  detail: string
  icon: ReactNode
  warning?: boolean
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border p-5 ${warning ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <span className={`[&>svg]:h-5 [&>svg]:w-5 ${warning ? 'text-red-600' : 'text-brand-600'}`}>
          {icon}
        </span>
      </div>
      <p
        className={`mt-3 break-words text-2xl font-bold tracking-tight ${warning ? 'text-red-800' : 'text-brand-900'}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  )
}
