import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { GetServerSideProps } from 'next'
import useSWR, { mutate } from 'swr'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'
import {
  Plus,
  Search,
  FolderKanban,
  CalendarDays,
  CircleDollarSign,
  ListTodo,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  UsersRound,
  GraduationCap,
  CalendarCheck2,
} from 'lucide-react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import {
  TYPE_LABELS,
  STATUS_LABELS,
  formatCurrency,
  formatDate,
} from '@/components/projects/project-utils'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import {
  projectsService,
  type Project,
  type ProjectOverview,
  type ProjectType,
  type ProjectStatus,
} from '@/services/projects'

const PROJECT_TYPES: ProjectType[] = [
  'CULTURAL',
  'ESPORTIVO',
  'EDUCACIONAL',
  'ASSISTENCIA_SOCIAL',
  'SAUDE',
  'AMBIENTAL',
  'OUTROS',
]

const PROJECT_STATUSES: ProjectStatus[] = [
  'RASCUNHO',
  'CAPTACAO',
  'APROVADO',
  'EM_EXECUCAO',
  'CONCLUIDO',
  'SUSPENSO',
  'CANCELADO',
]

const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  type: z.enum([
    'CULTURAL',
    'ESPORTIVO',
    'EDUCACIONAL',
    'ASSISTENCIA_SOCIAL',
    'SAUDE',
    'AMBIENTAL',
    'OUTROS',
  ]),
  description: z
    .string()
    .transform((value) => value.trim() || undefined)
    .optional(),
  code: z
    .string()
    .transform((value) => value.trim() || undefined)
    .optional(),
  start_date: z
    .string()
    .transform((value) => value || undefined)
    .optional(),
  end_date: z
    .string()
    .transform((value) => value || undefined)
    .optional(),
  total_budget: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().positive().optional(),
  ),
})

type FormData = z.infer<typeof schema>

export default function ProjetosPage() {
  const router = useRouter()
  const tenant = typeof router.query.tenant === 'string' ? router.query.tenant : ''
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const params: Record<string, string | number> = { page, limit: 20 }
  if (search) params.search = search
  if (statusFilter) params.status = statusFilter
  if (typeFilter) params.type = typeFilter

  const key = ['/projects', params] as const
  const { data, isLoading, error } = useSWR(key, () => projectsService.list(params), {
    keepPreviousData: true,
  })
  const { data: overview, mutate: mutateOverview } = useSWR<ProjectOverview>(
    '/projects/overview',
    projectsService.overview,
  )
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(dto: FormData) {
    setSubmitError('')
    try {
      const created = await projectsService.create(dto)
      await Promise.all([mutate(key), mutateOverview()])
      reset()
      setModalOpen(false)
      await router.push(`/${tenant}/projetos/${created.id}`)
    } catch (error) {
      const responseMessage = axios.isAxiosError(error) ? error.response?.data?.message : undefined
      setSubmitError(
        Array.isArray(responseMessage)
          ? responseMessage.join('. ')
          : responseMessage || 'Não foi possível criar o projeto.',
      )
    }
  }

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-700">Gestão de projetos sociais</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Projetos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Acompanhe os projetos e seus instrumentos de financiamento. Organize as atividades em Cursos e modalidades.
          </p>
        </div>
        <Link href={`/${tenant}/cursos`} className="btn-ghost">Cursos e modalidades</Link>
        <button className="btn-primary flex items-center gap-2" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Novo projeto
        </button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Projetos"
          value={overview?.projects.total ?? '—'}
          icon={<FolderKanban className="h-5 w-5" />}
        />
        <SummaryCard
          label="Em execução"
          value={overview?.projects.executing ?? '—'}
          icon={<Clock3 className="h-5 w-5" />}
          tone="blue"
        />
        <SummaryCard
          label="Alunos vinculados"
          value={overview?.operations.students ?? '—'}
          icon={<UsersRound className="h-5 w-5" />}
          tone="green"
        />
        <SummaryCard
          label="Turmas"
          value={overview?.operations.classes ?? '—'}
          icon={<GraduationCap className="h-5 w-5" />}
          tone="blue"
        />
        <SummaryCard
          label="Presentes hoje"
          value={overview?.operations.presentToday ?? '—'}
          icon={<CalendarCheck2 className="h-5 w-5" />}
          tone="green"
        />
        <SummaryCard
          label="Faltas hoje"
          value={overview?.operations.absentToday ?? '—'}
          icon={<CalendarDays className="h-5 w-5" />}
          tone={(overview?.operations.absentToday ?? 0) > 0 ? 'amber' : 'gray'}
        />
        <SummaryCard
          label="Tarefas em aberto"
          value={overview?.tasks.open ?? '—'}
          icon={<ListTodo className="h-5 w-5" />}
          tone="amber"
        />
        <SummaryCard
          label="Prazos vencidos"
          value={overview?.tasks.overdue ?? '—'}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={(overview?.tasks.overdue ?? 0) > 0 ? 'red' : 'green'}
        />
        <SummaryCard
          label="Orçamento planejado"
          value={formatCurrency(overview?.budget.planned)}
          icon={<CircleDollarSign className="h-5 w-5" />}
          tone="green"
        />
        <SummaryCard
          label="Orçamento aprovado"
          value={formatCurrency(overview?.budget.approved)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="blue"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:flex-none">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            className="input pl-9 w-full sm:w-64"
            placeholder="Buscar projeto ou código..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <select
          className="input w-full sm:w-48"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">Todos os status</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          className="input w-full sm:w-48"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">Todas as áreas</option>
          {PROJECT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        {(search || statusFilter || typeFilter) && (
          <button
            className="text-sm text-gray-500 hover:text-gray-900"
            onClick={() => {
              setSearch('')
              setStatusFilter('')
              setTypeFilter('')
              setPage(1)
            }}
          >
            Limpar filtros
          </button>
        )}
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
          <button
            className="btn-primary mt-4 flex items-center gap-2"
            onClick={() => setModalOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Criar primeiro projeto
          </button>
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {[
                    'Projeto',
                    'Área',
                    'Situação',
                    'Vínculos ativos',
                    'Atividades',
                    'Prazo',
                    'Orçamento',
                    'Equipe',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.data.map((p: Project) => (
                  <tr
                    key={p.id}
                    onClick={(event) => {
                      if (!(event.target as HTMLElement).closest('a, button, input, select'))
                        void router.push(`/${tenant}/projetos/${p.id}`)
                    }}
                    className="cursor-pointer transition-colors hover:bg-emerald-50/50 focus-within:bg-emerald-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/${tenant}/projetos/${p.id}`}
                        className="font-semibold text-brand-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
                      >
                        {p.name}
                      </Link>
                      <p className="mt-1 text-xs text-brand-600">Abrir gestão do projeto →</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {p.code || 'Sem código'}
                        {p.manager ? ` · ${p.manager.name}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{TYPE_LABELS[p.type]}</td>
                    <td className="px-4 py-3">
                      <Badge value={p.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">{p._count.beneficiario_vinculos}</td>
                    <td className="px-4 py-3">
                      {p.task_progress?.total ? (
                        <>
                          <div className="flex items-center justify-between text-xs text-gray-600">
                            <span>
                              {p.task_progress.completed}/{p.task_progress.total} concluídas
                            </span>
                            <span>
                              {Math.round(
                                (p.task_progress.completed * 100) / p.task_progress.total,
                              )}
                              %
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{
                                width: `${Math.round((p.task_progress.completed * 100) / p.task_progress.total)}%`,
                              }}
                            />
                          </div>
                          {p.task_progress.overdue > 0 && (
                            <span className="mt-1 inline-flex items-center gap-1 text-xs text-red-600">
                              <AlertTriangle className="h-3 w-3" />
                              {p.task_progress.overdue} vencida(s)
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">Planejamento pendente</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.end_date ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                          {formatDate(p.end_date)}
                        </span>
                      ) : (
                        'Sem prazo'
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-700">
                      {formatCurrency(p.total_budget)}
                    </td>
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
                >
                  Anterior
                </button>
                <span className="px-3 py-1">
                  {page} / {data.totalPages}
                </span>
                <button
                  className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40"
                  disabled={page === data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próximo
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal Criar Projeto */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          reset()
        }}
        title="Novo projeto"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {submitError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{submitError}</div>
          )}
          <div>
            <label className="label">Nome do projeto *</label>
            <input
              className="input"
              placeholder="Ex: Projeto Arte na Escola"
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo *</label>
              <select className="input" {...register('type')}>
                <option value="">Selecione...</option>
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
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
            <textarea
              className="input resize-none h-24"
              placeholder="Qual necessidade social será atendida? Quem será beneficiado e que mudança se espera alcançar?"
              {...register('description')}
            />
            <p className="mt-1 text-xs text-gray-500">
              Descreva o problema, o público atendido e o resultado esperado. Depois, organize a
              execução em etapas e atividades.
            </p>
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
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setModalOpen(false)
                reset()
              }}
            >
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

function SummaryCard({
  label,
  value,
  icon,
  tone = 'gray',
}: {
  label: string
  value: string | number
  icon: ReactNode
  tone?: 'gray' | 'blue' | 'amber' | 'red' | 'green'
}) {
  const tones = {
    gray: 'bg-white text-slate-600',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    green: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`rounded-xl p-2.5 ${tones[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-xs text-gray-500">{label}</p>
        <p className="mt-0.5 truncate text-lg font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  if (!ctx.req.cookies['refresh_token']) {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}
