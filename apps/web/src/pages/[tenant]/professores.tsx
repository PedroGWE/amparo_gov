import { useState } from 'react'
import { GetServerSideProps } from 'next'
import useSWR, { useSWRConfig } from 'swr'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import {
  PlusCircle, Search, GraduationCap, ChevronLeft, ChevronRight,
  Trash2, X, Edit2, History, Lock, Phone, Mail, BriefcaseBusiness, Clock3,
} from 'lucide-react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { professoresService, type Professor, type HistoricoRemuneracao } from '@/services/professores'
import { projectsService, type Project } from '@/services/projects'
import {
  createProfessorSchema,
  updateRemuneracaoSchema,
  createVinculoProfessorSchema,
  TIPO_VINCULOS,
  TIPO_VINCULO_LABELS,
  PROFESSOR_STATUSES,
  PROFESSOR_STATUS_LABELS,
  FORMAS_PAGAMENTO,
  type CreateProfessorInput,
  type UpdateRemuneracaoInput,
  type CreateVinculoProfessorInput,
} from '@cidadao/shared'

function formatDate(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}

function formatCurrency(v: number | null | undefined) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

const PROF_STEPS = ['Dados Pessoais', 'Formação', 'Dados Financeiros']

function ProfessorForm({
  defaultValues,
  onSubmit,
  onClose,
}: {
  defaultValues?: Partial<CreateProfessorInput>
  onSubmit: (data: CreateProfessorInput) => Promise<void>
  onClose: () => void
}) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [disciplinaInput, setDisciplinaInput] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateProfessorInput>({
    resolver: zodResolver(createProfessorSchema),
    defaultValues: {
      status: 'ATIVO',
      disciplinas: [],
      ...defaultValues,
    },
  })

  const disciplinas = watch('disciplinas') ?? []
  const tipoVinculo = watch('tipo_vinculo')

  function addDisciplina() {
    const trimmed = disciplinaInput.trim()
    if (trimmed && !disciplinas.includes(trimmed)) {
      setValue('disciplinas', [...disciplinas, trimmed])
      setDisciplinaInput('')
    }
  }

  function removeDisciplina(d: string) {
    setValue('disciplinas', disciplinas.filter((x) => x !== d))
  }

  async function submit(data: CreateProfessorInput) {
    setSaving(true)
    setSubmitError('')
    try {
      await onSubmit(data)
    } catch (error) {
      const responseMessage = axios.isAxiosError(error) ? error.response?.data?.message : undefined
      const message = Array.isArray(responseMessage) ? responseMessage.join('. ') : responseMessage
      setSubmitError(message || 'Não foi possível salvar o professor. Confira os dados e tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col h-full">
      {/* Steps */}
      <div className="flex gap-0 border-b border-gray-200 px-6 -mx-6 mb-6">
        {PROF_STEPS.map((label, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setStep(i)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              step === i
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {submitError && (
        <div role="alert" aria-live="assertive" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Step 0 — Dados Pessoais */}
        {step === 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Nome completo *</label>
              <input {...register('nome_completo')} className="input w-full" placeholder="Nome completo" />
              {errors.nome_completo && <p className="text-red-500 text-xs mt-0.5">{errors.nome_completo.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CPF *</label>
              <input {...register('cpf')} className="input w-full" placeholder="000.000.000-00" />
              {errors.cpf && <p className="text-red-500 text-xs mt-0.5">{errors.cpf.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">RG</label>
              <input {...register('rg')} className="input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Data de nascimento</label>
              <input {...register('data_nascimento')} type="date" className="input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Telefone</label>
              <input {...register('telefone')} className="input w-full" placeholder="(11) 99999-9999" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">E-mail</label>
              <input {...register('email')} type="email" className="input w-full" placeholder="email@exemplo.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select {...register('status')} className="input w-full">
                {PROFESSOR_STATUSES.map((s) => (
                  <option key={s} value={s}>{PROFESSOR_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de vínculo *</label>
              <select {...register('tipo_vinculo')} className="input w-full">
                <option value="">Selecione</option>
                {TIPO_VINCULOS.map((t) => (
                  <option key={t} value={t}>{TIPO_VINCULO_LABELS[t]}</option>
                ))}
              </select>
              {errors.tipo_vinculo && <p className="text-red-500 text-xs mt-0.5">{errors.tipo_vinculo.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Data de admissão</label>
              <input {...register('data_admissao')} type="date" className="input w-full" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Observações</label>
              <textarea {...register('observacoes')} className="input w-full" rows={2} />
            </div>
            {/* Endereço básico */}
            <div className="col-span-2 pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider">Endereço</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CEP</label>
              <input {...register('cep')} className="input w-full" maxLength={8} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">UF</label>
              <input {...register('uf')} className="input w-full" maxLength={2} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Logradouro</label>
              <input {...register('logradouro')} className="input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Número</label>
              <input {...register('numero')} className="input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cidade</label>
              <input {...register('cidade')} className="input w-full" />
            </div>
          </div>
        )}

        {/* Step 1 — Formação */}
        {step === 1 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Formação acadêmica</label>
              <input {...register('formacao_academica')} className="input w-full" placeholder="ex: Pedagogia, Educação Física" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Especialização</label>
              <input {...register('especializacao')} className="input w-full" placeholder="Pós-graduação, MBA, etc." />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Disciplinas / Áreas de atuação</label>
              <div className="flex gap-2">
                <input
                  value={disciplinaInput}
                  onChange={(e) => setDisciplinaInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDisciplina() } }}
                  className="input flex-1"
                  placeholder="Digite e pressione Enter"
                />
                <button type="button" onClick={addDisciplina} className="btn-ghost text-sm">Adicionar</button>
              </div>
              {disciplinas.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {disciplinas.map((d) => (
                    <span key={d} className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 rounded-full px-3 py-1 text-xs">
                      {d}
                      <button type="button" onClick={() => removeDisciplina(d)}><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Comprovante de formação (URL)</label>
              <input {...register('comprovante_formacao_url')} className="input w-full" placeholder="https://..." />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Contrato (URL)</label>
              <input {...register('contrato_url')} className="input w-full" placeholder="https://..." />
            </div>
          </div>
        )}

        {/* Step 2 — Dados Financeiros */}
        {step === 2 && (
          <div className="grid grid-cols-2 gap-4">
            {tipoVinculo === 'VOLUNTARIO' ? (
              <div className="col-span-2 rounded-lg bg-violet-50 border border-violet-200 p-4 text-sm text-violet-800">
                Professor voluntário — sem remuneração.
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Valor hora-aula</label>
                  <input {...register('valor_hora_aula')} type="number" step="0.01" className="input w-full" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Valor mensal</label>
                  <input {...register('valor_mensal')} type="number" step="0.01" className="input w-full" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Forma de pagamento</label>
                  <select {...register('forma_pagamento')} className="input w-full">
                    <option value="">Selecione</option>
                    {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Dia do pagamento</label>
                  <input {...register('dia_pagamento')} type="number" min={1} max={31} className="input w-full" placeholder="ex: 5" />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={() => (step > 0 ? setStep(step - 1) : onClose())}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          {step === 0 ? 'Cancelar' : 'Voltar'}
        </button>
        <div className="flex gap-2">
          {step < PROF_STEPS.length - 1 ? (
            <button type="button" onClick={() => setStep(step + 1)} className="btn-primary">
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </button>
          ) : (
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Salvando...' : 'Salvar professor'}
            </button>
          )}
        </div>
      </div>
    </form>
  )
}

function DetailDrawer({
  professor,
  projects,
  onClose,
  onRefresh,
}: {
  professor: Professor & { historico?: HistoricoRemuneracao[] }
  projects: Project[]
  onClose: () => void
  onRefresh: () => void
}) {
  const hasFinanceiro = professor.historico !== undefined
  const [tab, setTab] = useState<'vinculos' | 'historico'>('vinculos')
  const [showAddVinculo, setShowAddVinculo] = useState(false)
  const [showAddHistorico, setShowAddHistorico] = useState(false)

  const vinculoForm = useForm<CreateVinculoProfessorInput>({ resolver: zodResolver(createVinculoProfessorSchema) })
  const historicoForm = useForm<UpdateRemuneracaoInput>({ resolver: zodResolver(updateRemuneracaoSchema) })

  async function addVinculo(data: CreateVinculoProfessorInput) {
    await professoresService.addVinculo(professor.id, data as Record<string, unknown>)
    vinculoForm.reset()
    setShowAddVinculo(false)
    onRefresh()
  }

  async function addHistorico(data: UpdateRemuneracaoInput) {
    await professoresService.addHistorico(professor.id, data as Record<string, unknown>)
    historicoForm.reset()
    setShowAddHistorico(false)
    onRefresh()
  }

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-white shadow-2xl z-40 flex flex-col border-l border-gray-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div>
          <p className="font-semibold text-gray-900">{professor.nome_completo}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge value={professor.tipo_vinculo} />
            <Badge value={professor.status} />
          </div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex gap-0 border-b border-gray-200 px-6">
        {(['vinculos', 'historico'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'historico' && (hasFinanceiro ? <History className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />)}
            {t === 'vinculos' ? 'Projetos' : 'Remuneração'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {tab === 'vinculos' && (
          <div className="space-y-3">
            {professor.projetos.map((v) => (
              <div key={v.id} className="rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-medium text-gray-900">{v.project.name}</p>
                <p className="text-xs text-gray-500">
                  {v.carga_horaria_semanal ? `${v.carga_horaria_semanal}h/sem` : 'Carga horária não informada'}
                </p>
                <Badge value={v.status} className="mt-1" />
              </div>
            ))}
            {professor.projetos.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum projeto vinculado.</p>
            )}

            {showAddVinculo ? (
              <form onSubmit={vinculoForm.handleSubmit(addVinculo)} className="rounded-lg border border-brand-200 p-4 space-y-3">
                <p className="text-sm font-medium text-gray-900">Vincular a projeto</p>
                <select {...vinculoForm.register('project_id')} className="input w-full">
                  <option value="">Selecione projeto *</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Data início *</label>
                    <input {...vinculoForm.register('data_inicio')} type="date" className="input w-full" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Carga horária/sem</label>
                    <input {...vinculoForm.register('carga_horaria_semanal')} type="number" className="input w-full" placeholder="ex: 20" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowAddVinculo(false)} className="btn-ghost text-sm">Cancelar</button>
                  <button type="submit" className="btn-primary text-sm">Vincular</button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowAddVinculo(true)}
                className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
              >
                + Vincular a projeto
              </button>
            )}
          </div>
        )}

        {tab === 'historico' && professor.historico == null && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
            <Lock className="h-8 w-8 mb-3 text-gray-300" />
            <p className="text-sm font-medium">Acesso restrito</p>
            <p className="text-xs mt-1">Você não tem permissão para ver dados financeiros.</p>
          </div>
        )}

        {tab === 'historico' && professor.historico != null && (
          <div className="space-y-3">
            {(professor.historico ?? []).map((h) => (
              <div key={h.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">Vigência: {formatDate(h.data_vigencia)}</p>
                  <p className="text-xs text-gray-500">{formatDate(h.created_at)}</p>
                </div>
                <div className="flex gap-4 mt-1">
                  {h.valor_hora_aula != null && (
                    <p className="text-xs text-gray-600">Hora-aula: <span className="font-semibold">{formatCurrency(h.valor_hora_aula)}</span></p>
                  )}
                  {h.valor_mensal != null && (
                    <p className="text-xs text-gray-600">Mensal: <span className="font-semibold">{formatCurrency(h.valor_mensal)}</span></p>
                  )}
                </div>
                {h.motivo && <p className="text-xs text-gray-500 mt-1 italic">{h.motivo}</p>}
              </div>
            ))}
            {(professor.historico ?? []).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum histórico de remuneração.</p>
            )}

            {showAddHistorico ? (
              <form onSubmit={historicoForm.handleSubmit(addHistorico)} className="rounded-lg border border-brand-200 p-4 space-y-3">
                <p className="text-sm font-medium text-gray-900">Nova remuneração</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Valor hora-aula</label>
                    <input {...historicoForm.register('valor_hora_aula')} type="number" step="0.01" className="input w-full" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Valor mensal</label>
                    <input {...historicoForm.register('valor_mensal')} type="number" step="0.01" className="input w-full" placeholder="0.00" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Data de vigência *</label>
                  <input {...historicoForm.register('data_vigencia')} type="date" className="input w-full" />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Motivo da alteração</label>
                  <input {...historicoForm.register('motivo')} className="input w-full" placeholder="ex: Reajuste anual" />
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowAddHistorico(false)} className="btn-ghost text-sm">Cancelar</button>
                  <button type="submit" className="btn-primary text-sm">Registrar</button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowAddHistorico(true)}
                className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
              >
                + Registrar remuneração
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ProfessoresPage() {
  const { mutate } = useSWRConfig()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [tipoFilter, setTipoFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Professor | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const params: Record<string, string | number> = { page, limit: 20 }
  if (search) params.search = search
  if (statusFilter) params.status = statusFilter
  if (tipoFilter) params.tipo_vinculo = tipoFilter

  const { data, isLoading } = useSWR(
    ['/professores', params],
    () => professoresService.list(params),
    { keepPreviousData: true },
  )

  const { data: detail, mutate: mutateDetail } = useSWR(
    detailId ? `/professores/${detailId}` : null,
    () => professoresService.get(detailId!),
  )

  const { data: projectsData } = useSWR('/projects-all', () =>
    projectsService.list({ limit: 100, include_legacy: 'true' }),
  )
  const projects = projectsData?.data ?? []

  async function handleCreate(dto: CreateProfessorInput) {
    if (editItem) {
      await professoresService.update(editItem.id, dto as Record<string, unknown>)
    } else {
      await professoresService.create(dto as Record<string, unknown>)
    }
    mutate(['/professores', params])
    setShowForm(false)
    setEditItem(null)
  }

  async function handleDelete(p: Professor) {
    if (!confirm(`Desligar ${p.nome_completo}? O professor será marcado como DESLIGADO.`)) return
    await professoresService.remove(p.id)
    mutate(['/professores', params])
  }

  function openEdit(p: Professor) {
    setEditItem(p)
    setShowForm(true)
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Professores</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {data?.total ?? 0} educador{data?.total !== 1 ? 'es' : ''} cadastrado{data?.total !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => { setEditItem(null); setShowForm(true) }}
            className="btn-primary flex items-center gap-2"
          >
            <PlusCircle className="h-4 w-4" />
            Novo professor
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              className="input pl-9 w-full"
              placeholder="Buscar por nome ou CPF..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          >
            <option value="">Todos os status</option>
            {PROFESSOR_STATUSES.map((s) => (
              <option key={s} value={s}>{PROFESSOR_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select
            className="input"
            value={tipoFilter}
            onChange={(e) => { setTipoFilter(e.target.value); setPage(1) }}
          >
            <option value="">Todos os tipos</option>
            {TIPO_VINCULOS.map((t) => (
              <option key={t} value={t}>{TIPO_VINCULO_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {/* Educator summaries */}
        <div>
          {isLoading ? (
            <PageSpinner />
          ) : !data?.data.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-12 w-12 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
                <GraduationCap className="h-6 w-6 text-brand-600" />
              </div>
              <p className="text-sm font-medium text-gray-900">Nenhum professor encontrado</p>
              <p className="text-xs text-gray-500 mt-1">Clique em &ldquo;Novo professor&rdquo; para cadastrar.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.data.map((p) => {
                const weeklyHours = p.projetos.reduce((total, item) => total + (item.carga_horaria_semanal ?? 0), 0)
                return (
                  <article key={p.id} className="card group p-5 hover:border-brand-200 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <button onClick={() => setDetailId(detailId === p.id ? null : p.id)} className="flex min-w-0 items-center gap-3 text-left">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-50 text-sm font-bold text-violet-700">
                          {p.nome_completo.split(' ').slice(0, 2).map((part) => part[0]).join('')}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-gray-900 group-hover:text-brand-700">{p.nome_completo}</span>
                          <span className="block text-xs text-gray-500">Desde {formatDate(p.data_admissao ?? p.created_at)}</span>
                        </span>
                      </button>
                      <Badge value={p.status} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-1.5 min-h-[26px]">
                      {p.disciplinas.slice(0, 3).map((subject) => <span key={subject} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">{subject}</span>)}
                      {p.disciplinas.length > 3 && <span className="px-1 py-1 text-xs text-gray-400">+{p.disciplinas.length - 3}</span>}
                      {!p.disciplinas.length && <span className="text-xs text-gray-400">Disciplinas não informadas</span>}
                    </div>

                    <div className="mt-4 space-y-2.5 text-sm text-gray-600">
                      <p className="flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4 text-gray-400" /><span>{TIPO_VINCULO_LABELS[p.tipo_vinculo]}</span></p>
                      <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400" /><span className="truncate">{p.email ?? 'E-mail não informado'}</span></p>
                      <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-gray-400" /><span>{p.telefone ?? 'Telefone não informado'}</span></p>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-3 text-center">
                      <div><p className="text-base font-semibold text-gray-900">{p.projetos.length}</p><p className="text-[11px] text-gray-500">projetos ativos</p></div>
                      <div><p className="flex items-center justify-center gap-1 text-base font-semibold text-gray-900"><Clock3 className="h-4 w-4 text-gray-400" />{weeklyHours || '—'}</p><p className="text-[11px] text-gray-500">horas semanais</p></div>
                    </div>

                    {p.projetos[0] && <p className="mt-3 truncate text-xs text-gray-500">Atuação: <span className="font-medium text-gray-700">{p.projetos.map((item) => item.project.name).join(', ')}</span></p>}

                    <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                      <button onClick={() => setDetailId(p.id)} className="text-sm font-medium text-brand-700 hover:text-brand-800">Ver perfil completo</button>
                      <div className="flex gap-1">
                        <button aria-label={`Editar ${p.nome_completo}`} onClick={() => openEdit(p)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700"><Edit2 className="h-4 w-4" /></button>
                        <button aria-label={`Desligar ${p.nome_completo}`} onClick={() => handleDelete(p)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Página {data.page} de {data.totalPages}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="btn-ghost disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setPage(page + 1)} disabled={page >= data.totalPages} className="btn-ghost disabled:opacity-40">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal cadastro / edição */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditItem(null) }}
        title={editItem ? `Editar: ${editItem.nome_completo}` : 'Novo professor'}
        size="lg"
      >
        <ProfessorForm
          key={editItem?.id ?? 'new'}
          defaultValues={editItem as unknown as Partial<CreateProfessorInput>}
          onSubmit={handleCreate}
          onClose={() => { setShowForm(false); setEditItem(null) }}
        />
      </Modal>

      {/* Detalhe drawer */}
      {detailId && detail && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setDetailId(null)} />
          <DetailDrawer
            professor={detail}
            projects={projects}
            onClose={() => setDetailId(null)}
            onRefresh={() => mutateDetail()}
          />
        </>
      )}
    </DashboardLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  if (!ctx.req.cookies['refresh_token']) {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}
