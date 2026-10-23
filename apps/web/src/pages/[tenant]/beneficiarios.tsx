import { useState } from 'react'
import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useSWR, { useSWRConfig } from 'swr'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import { PlusCircle, Search, Users, ChevronLeft, ChevronRight, Trash2, X, Edit2, ChevronDown, School, Phone, FolderKanban, ShieldCheck, MapPin, HeartPulse, UserRound, BookOpen, AlertTriangle, CheckCircle2 } from 'lucide-react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { beneficiariosService, type Beneficiario, type BeneficiarioDetail, type Responsavel, type VinculoProjeto } from '@/services/beneficiarios'
import { projectsService, type Project } from '@/services/projects'
import {
  createBeneficiarioSchema,
  createResponsavelSchema,
  createVinculoSchema,
  BENEFICIARY_STATUSES,
  BENEFICIARY_STATUS_LABELS,
  GENDERS,
  GENDER_LABELS,
  PARENTESCO_TYPES,
  PARENTESCO_LABELS,
  VINCULO_STATUSES,
  type CreateBeneficiarioInput,
  type CreateResponsavelInput,
  type CreateVinculoInput,
} from '@cidadao/shared'

function formatDate(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}

function getAge(d?: string | null) {
  if (!d) return null
  const birth = new Date(d)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--
  return age
}

function DetailItem({ label, value }: { label: string; value?: string | number | null }) {
  return <div><p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p><p className="mt-0.5 text-sm text-gray-800">{value || 'Não informado'}</p></div>
}

const STEPS = ['Dados Pessoais', 'Endereço', 'Turma / Escola', 'LGPD']

function editDefaults(beneficiario: BeneficiarioDetail): Partial<CreateBeneficiarioInput> {
  return {
    name: beneficiario.name,
    cpf: beneficiario.cpf ?? undefined,
    birth_date: beneficiario.birth_date?.slice(0, 10) ?? undefined,
    gender: beneficiario.gender ?? undefined,
    telefone: beneficiario.telefone ?? undefined,
    email: beneficiario.email ?? '',
    rg_certidao: beneficiario.rg_certidao ?? undefined,
    cep: beneficiario.cep ?? undefined,
    logradouro: beneficiario.logradouro ?? undefined,
    numero: beneficiario.numero ?? undefined,
    complemento: beneficiario.complemento ?? undefined,
    bairro: beneficiario.bairro ?? undefined,
    cidade: beneficiario.cidade ?? undefined,
    uf_endereco: beneficiario.uf_endereco ?? undefined,
    turma: beneficiario.turma ?? undefined,
    turno: beneficiario.turno ?? undefined,
    escola: beneficiario.escola ?? undefined,
    serie_ano: beneficiario.serie_ano ?? undefined,
    necessidades_especiais: beneficiario.necessidades_especiais ?? undefined,
    alergias: beneficiario.alergias ?? undefined,
    medicamentos: beneficiario.medicamentos ?? undefined,
    observacoes_gerais: beneficiario.observacoes_gerais ?? undefined,
    termo_consentimento: beneficiario.termo_consentimento,
    data_consentimento: beneficiario.data_consentimento?.slice(0, 10) ?? undefined,
    autorizacao_uso_imagem: beneficiario.autorizacao_uso_imagem,
    status: beneficiario.status,
    project_id: beneficiario.project?.id ?? undefined,
  }
}

function BeneficiarioForm({
  defaultValues,
  projects,
  onSubmit,
  onClose,
}: {
  defaultValues?: Partial<CreateBeneficiarioInput>
  projects: Project[]
  onSubmit: (data: CreateBeneficiarioInput) => Promise<void>
  onClose: () => void
}) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateBeneficiarioInput>({
    resolver: zodResolver(createBeneficiarioSchema),
    defaultValues: {
      status: 'ATIVO',
      termo_consentimento: false,
      autorizacao_uso_imagem: false,
      ...defaultValues,
    },
  })

  const termoConsentimento = watch('termo_consentimento')

  async function submit(data: CreateBeneficiarioInput) {
    setSaving(true)
    setSubmitError('')
    try {
      await onSubmit(data)
    } catch (error) {
      const responseMessage = axios.isAxiosError(error) ? error.response?.data?.message : undefined
      setSubmitError(Array.isArray(responseMessage) ? responseMessage.join('. ') : responseMessage || 'Não foi possível salvar o beneficiário. Confira os dados e tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  function showValidationErrors(invalid: Record<string, unknown>) {
    const addressFields = ['cep', 'uf_endereco', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade']
    const schoolFields = ['turma', 'turno', 'escola', 'serie_ano', 'necessidades_especiais', 'alergias', 'medicamentos', 'observacoes_gerais']
    const consentFields = ['termo_consentimento', 'data_consentimento', 'autorizacao_uso_imagem']
    const fields = Object.keys(invalid)
    setStep(fields.some((field) => !addressFields.includes(field) && !schoolFields.includes(field) && !consentFields.includes(field))
      ? 0
      : fields.some((field) => addressFields.includes(field))
        ? 1
        : fields.some((field) => schoolFields.includes(field)) ? 2 : 3)
    setSubmitError('Revise os campos indicados antes de salvar.')
  }

  return (
    <form onSubmit={handleSubmit(submit, showValidationErrors)} className="flex flex-col h-full">
      {/* Steps */}
      <div className="flex gap-0 border-b border-gray-200 px-6 -mx-6 mb-6">
        {STEPS.map((label, i) => (
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

      {submitError && <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{submitError}</div>}

      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Step 0 — Dados Pessoais */}
        {step === 0 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome completo *</label>
                <input {...register('name')} className="input w-full" placeholder="Nome completo" />
                {errors.name && <p className="text-red-500 text-xs mt-0.5">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">CPF</label>
                <input {...register('cpf')} className="input w-full" placeholder="000.000.000-00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">RG / Certidão</label>
                <input {...register('rg_certidao')} className="input w-full" placeholder="RG ou certidão de nascimento" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Data de nascimento</label>
                <input {...register('birth_date')} type="date" className="input w-full" />
                {errors.birth_date && <p className="text-red-500 text-xs mt-0.5">Data de nascimento inválida</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Gênero</label>
                <select {...register('gender')} className="input w-full">
                  <option value="">Selecione</option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>{GENDER_LABELS[g]}</option>
                  ))}
                </select>
                {errors.gender && <p className="text-red-500 text-xs mt-0.5">Selecione um gênero válido</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Telefone</label>
                <input {...register('telefone')} className="input w-full" placeholder="(11) 99999-9999" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">E-mail</label>
                <input {...register('email')} type="email" className="input w-full" placeholder="email@exemplo.com" />
                {errors.email && <p className="text-red-500 text-xs mt-0.5">{errors.email.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                <select {...register('status')} className="input w-full">
                  {BENEFICIARY_STATUSES.map((s) => (
                    <option key={s} value={s}>{BENEFICIARY_STATUS_LABELS[s]}</option>
                  ))}
                </select>
                {errors.project_id && <p className="text-red-500 text-xs mt-0.5">Selecione um projeto válido</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Projeto padrão</label>
                <select {...register('project_id')} className="input w-full">
                  <option value="">Nenhum</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        {/* Step 1 — Endereço */}
        {step === 1 && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CEP</label>
              <input {...register('cep')} className="input w-full" placeholder="00000-000" maxLength={8} />
              {errors.cep && <p className="text-red-500 text-xs mt-0.5">Informe um CEP com até 8 dígitos</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">UF</label>
              <input {...register('uf_endereco')} className="input w-full" placeholder="SP" maxLength={2} />
              {errors.uf_endereco && <p className="text-red-500 text-xs mt-0.5">Informe a UF com duas letras</p>}
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Logradouro</label>
              <input {...register('logradouro')} className="input w-full" placeholder="Rua / Av." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Número</label>
              <input {...register('numero')} className="input w-full" placeholder="123" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Complemento</label>
              <input {...register('complemento')} className="input w-full" placeholder="Apto, bloco..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Bairro</label>
              <input {...register('bairro')} className="input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cidade</label>
              <input {...register('cidade')} className="input w-full" />
            </div>
          </div>
        )}

        {/* Step 2 — Turma / Escola */}
        {step === 2 && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Turma</label>
              <input {...register('turma')} className="input w-full" placeholder="ex: 2024A" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Turno</label>
              <select {...register('turno')} className="input w-full">
                <option value="">Selecione</option>
                <option value="MANHA">Manhã</option>
                <option value="TARDE">Tarde</option>
                <option value="NOITE">Noite</option>
                <option value="INTEGRAL">Integral</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Escola</label>
              <input {...register('escola')} className="input w-full" placeholder="Nome da escola" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Série / Ano</label>
              <input {...register('serie_ano')} className="input w-full" placeholder="ex: 7º ano" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Necessidades especiais</label>
              <textarea {...register('necessidades_especiais')} className="input w-full" rows={2} placeholder="Descreva se houver" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Alergias</label>
              <textarea {...register('alergias')} className="input w-full" rows={2} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Medicamentos em uso</label>
              <textarea {...register('medicamentos')} className="input w-full" rows={2} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Observações gerais</label>
              <textarea {...register('observacoes_gerais')} className="input w-full" rows={3} />
            </div>
          </div>
        )}

        {/* Step 3 — LGPD */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
              <p className="font-medium mb-1">Lei Geral de Proteção de Dados (LGPD)</p>
              <p>Os dados coletados são necessários para a prestação dos serviços socioassistenciais e serão tratados com base legal adequada. O beneficiário ou responsável deve consentir explicitamente.</p>
            </div>
            <div className="space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termoConsentimento}
                  onChange={(e) => setValue('termo_consentimento', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Termo de consentimento assinado *</span>
                  <p className="text-xs text-gray-500 mt-0.5">O responsável/beneficiário assinou o termo de consentimento para coleta e uso dos dados pessoais.</p>
                </div>
              </label>
              {termoConsentimento && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Data do consentimento</label>
                  <input {...register('data_consentimento')} type="date" className="input w-full" />
                  {errors.data_consentimento && <p className="text-red-500 text-xs mt-0.5">Data de consentimento inválida</p>}
                </div>
              )}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('autorizacao_uso_imagem')}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Autorização de uso de imagem</span>
                  <p className="text-xs text-gray-500 mt-0.5">O responsável/beneficiário autorizou a captação e uso de imagem para fins institucionais.</p>
                </div>
              </label>
            </div>
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
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="btn-primary"
            >
              Próximo
              <ChevronRight className="h-4 w-4 ml-1" />
            </button>
          ) : (
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Salvando...' : 'Salvar beneficiário'}
            </button>
          )}
        </div>
      </div>
    </form>
  )
}

function DetailDrawer({
  beneficiario,
  projects,
  onClose,
  onRefresh,
}: {
  beneficiario: BeneficiarioDetail
  projects: Project[]
  onClose: () => void
  onRefresh: () => void
}) {
  const [tab, setTab] = useState<'resumo' | 'responsaveis' | 'vinculos'>('resumo')
  const [showAddResp, setShowAddResp] = useState(false)
  const [showAddVinculo, setShowAddVinculo] = useState(false)
  const [documentError, setDocumentError] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  async function downloadDocument(document: BeneficiarioDetail['documents'][number]) {
    setDocumentError('')
    setDownloadingId(document.id)
    try {
      const blob = await beneficiariosService.downloadDocument(beneficiario.id, document.id)
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = document.name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setDocumentError('Não foi possível baixar o anexo. Tente novamente.')
    } finally {
      setDownloadingId(null)
    }
  }

  const respForm = useForm<CreateResponsavelInput>({ resolver: zodResolver(createResponsavelSchema) })
  const vinculoForm = useForm<CreateVinculoInput>({ resolver: zodResolver(createVinculoSchema) })

  async function addResponsavel(data: CreateResponsavelInput) {
    await beneficiariosService.addResponsavel(beneficiario.id, data as Record<string, unknown>)
    respForm.reset()
    setShowAddResp(false)
    onRefresh()
  }

  async function removeResponsavel(rId: string) {
    if (!confirm('Remover responsável?')) return
    await beneficiariosService.removeResponsavel(beneficiario.id, rId)
    onRefresh()
  }

  async function addVinculo(data: CreateVinculoInput) {
    await beneficiariosService.addVinculo(beneficiario.id, data as Record<string, unknown>)
    vinculoForm.reset()
    setShowAddVinculo(false)
    onRefresh()
  }

  async function removeVinculo(vId: string) {
    if (!confirm('Remover vínculo?')) return
    await beneficiariosService.removeVinculo(beneficiario.id, vId)
    onRefresh()
  }

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[560px] bg-white shadow-2xl z-40 flex flex-col border-l border-gray-200">
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-700">{beneficiario.name.split(' ').slice(0, 2).map((part) => part[0]).join('')}</span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{beneficiario.name}</p>
            <p className="text-xs text-gray-500">{getAge(beneficiario.birth_date) != null ? `${getAge(beneficiario.birth_date)} anos` : 'Idade não informada'} · {beneficiario.cpf ?? 'CPF não informado'}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex gap-0 border-b border-gray-200 px-6">
        {(['resumo', 'responsaveis', 'vinculos'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 capitalize transition-colors ${
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'resumo' ? 'Visão geral' : t === 'responsaveis' ? `Responsáveis (${beneficiario.responsaveis.length})` : `Vínculos (${beneficiario.vinculos_projetos.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {tab === 'resumo' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-brand-50 p-3 text-center"><p className="text-lg font-semibold text-brand-800">{beneficiario.serie_ano ?? '—'}</p><p className="text-[11px] text-brand-700">série / ano</p></div>
              <div className="rounded-xl bg-blue-50 p-3 text-center"><p className="truncate text-lg font-semibold text-blue-800">{beneficiario.turma ?? '—'}</p><p className="text-[11px] text-blue-700">turma</p></div>
              <div className="rounded-xl bg-emerald-50 p-3 text-center"><p className="text-lg font-semibold text-emerald-800">{beneficiario.vinculos_projetos.length}</p><p className="text-[11px] text-emerald-700">projetos</p></div>
            </div>

            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900"><UserRound className="h-4 w-4 text-brand-600" />Dados pessoais e contato</h3>
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                <DetailItem label="Nascimento" value={formatDate(beneficiario.birth_date)} />
                <DetailItem label="Gênero" value={beneficiario.gender?.replaceAll('_', ' ')} />
                <DetailItem label="RG / Certidão" value={beneficiario.rg_certidao} />
                <DetailItem label="Raça / cor" value={beneficiario.race?.replaceAll('_', ' ')} />
                <DetailItem label="Telefone" value={beneficiario.telefone} />
                <DetailItem label="E-mail" value={beneficiario.email} />
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900"><BookOpen className="h-4 w-4 text-brand-600" />Jornada educacional</h3>
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                <DetailItem label="Escola" value={beneficiario.escola} />
                <DetailItem label="Série / ano" value={beneficiario.serie_ano} />
                <DetailItem label="Turma" value={beneficiario.turma} />
                <DetailItem label="Turno" value={beneficiario.turno} />
                <div className="col-span-2"><DetailItem label="Projeto principal" value={beneficiario.project?.name} /></div>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900"><MapPin className="h-4 w-4 text-brand-600" />Endereço e contexto familiar</h3>
              <p className="mb-3 text-sm text-gray-700">{[beneficiario.logradouro, beneficiario.numero, beneficiario.complemento, beneficiario.bairro, beneficiario.cidade, beneficiario.uf_endereco].filter(Boolean).join(', ') || 'Endereço não informado'}</p>
              <div className="grid grid-cols-2 gap-4">
                <DetailItem label="Pessoas na residência" value={beneficiario.pessoas_residencia} />
                <DetailItem label="Renda familiar" value={beneficiario.renda_familiar != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(beneficiario.renda_familiar) : null} />
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900"><HeartPulse className="h-4 w-4 text-rose-500" />Saúde e cuidados</h3>
              <div className="space-y-3"><DetailItem label="Necessidades especiais" value={beneficiario.necessidades_especiais} /><DetailItem label="Alergias" value={beneficiario.alergias} /><DetailItem label="Medicamentos em uso" value={beneficiario.medicamentos} /><DetailItem label="Observações gerais" value={beneficiario.observacoes_gerais} /></div>
            </section>

            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900"><ShieldCheck className="h-4 w-4 text-brand-600" />Consentimentos e proteção de dados</h3>
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm text-gray-700">{beneficiario.termo_consentimento ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />} Termo de consentimento {beneficiario.termo_consentimento ? `assinado em ${formatDate(beneficiario.data_consentimento)}` : 'pendente'}</p>
                <p className="flex items-center gap-2 text-sm text-gray-700">{beneficiario.autorizacao_uso_imagem ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />} Uso de imagem {beneficiario.autorizacao_uso_imagem ? 'autorizado' : 'não autorizado'}</p>
              </div>
            </section>
            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Documentos do aluno ({beneficiario.documents?.length ?? 0})</h3>
              {documentError && <p role="alert" className="mb-2 text-sm text-red-700">{documentError}</p>}
              {!beneficiario.documents?.length && <p className="text-sm text-gray-500">Nenhum documento anexado.</p>}
              <div className="space-y-2">{beneficiario.documents?.map((document) => <div key={document.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3"><div className="min-w-0"><p className="break-words text-sm font-medium text-gray-900">{document.name}</p><p className="text-xs text-gray-500">Anexado em {formatDate(document.created_at)}</p></div><button type="button" onClick={() => downloadDocument(document)} disabled={downloadingId !== null} className="shrink-0 text-sm font-medium text-brand-700 disabled:opacity-40">{downloadingId === document.id ? 'Baixando...' : 'Baixar PDF'}</button></div>)}</div>
            </section>
          </div>
        )}

        {tab === 'responsaveis' && (
          <div className="space-y-3">
            {beneficiario.responsaveis.map((r) => (
              <div key={r.id} className="flex items-start justify-between rounded-lg border border-gray-200 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.nome_completo}</p>
                  <p className="text-xs text-gray-500">{PARENTESCO_LABELS[r.parentesco]} {r.telefone ? `· ${r.telefone}` : ''}</p>
                </div>
                <button onClick={() => removeResponsavel(r.id)} className="text-gray-400 hover:text-red-500 p-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {beneficiario.responsaveis.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum responsável cadastrado.</p>
            )}

            {showAddResp ? (
              <form onSubmit={respForm.handleSubmit(addResponsavel)} className="rounded-lg border border-brand-200 p-4 space-y-3">
                <p className="text-sm font-medium text-gray-900">Novo responsável</p>
                <input {...respForm.register('nome_completo')} className="input w-full" placeholder="Nome completo *" />
                <select {...respForm.register('parentesco')} className="input w-full">
                  <option value="">Parentesco *</option>
                  {PARENTESCO_TYPES.map((p) => <option key={p} value={p}>{PARENTESCO_LABELS[p]}</option>)}
                </select>
                <input {...respForm.register('cpf')} className="input w-full" placeholder="CPF" />
                <input {...respForm.register('telefone')} className="input w-full" placeholder="Telefone" />
                <input {...respForm.register('email')} type="email" className="input w-full" placeholder="E-mail" />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowAddResp(false)} className="btn-ghost text-sm">Cancelar</button>
                  <button type="submit" className="btn-primary text-sm">Adicionar</button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowAddResp(true)}
                className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
              >
                + Adicionar responsável
              </button>
            )}
          </div>
        )}

        {tab === 'vinculos' && (
          <div className="space-y-3">
            {beneficiario.vinculos_projetos.map((v) => (
              <div key={v.id} className="flex items-start justify-between rounded-lg border border-gray-200 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{v.project.name}</p>
                  <p className="text-xs text-gray-500">
                    Ingresso: {formatDate(v.data_ingresso)}
                    {v.turma ? ` · Turma: ${v.turma}` : ''}
                  </p>
                  <Badge value={v.status} className="mt-1" />
                </div>
                <button onClick={() => removeVinculo(v.id)} className="text-gray-400 hover:text-red-500 p-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {beneficiario.vinculos_projetos.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum vínculo cadastrado.</p>
            )}

            {showAddVinculo ? (
              <form onSubmit={vinculoForm.handleSubmit(addVinculo)} className="rounded-lg border border-brand-200 p-4 space-y-3">
                <p className="text-sm font-medium text-gray-900">Novo vínculo</p>
                <select {...vinculoForm.register('project_id')} className="input w-full">
                  <option value="">Selecione projeto *</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Data ingresso *</label>
                    <input {...vinculoForm.register('data_ingresso')} type="date" className="input w-full" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Status</label>
                    <select {...vinculoForm.register('status')} className="input w-full">
                      {VINCULO_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Turma</label>
                    <input {...vinculoForm.register('turma')} className="input w-full" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Turno</label>
                    <select {...vinculoForm.register('turno')} className="input w-full">
                      <option value="">—</option>
                      <option value="MANHA">Manhã</option>
                      <option value="TARDE">Tarde</option>
                      <option value="NOITE">Noite</option>
                      <option value="INTEGRAL">Integral</option>
                    </select>
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
      </div>
    </div>
  )
}

export default function BeneficiariosPage() {
  const router = useRouter()
  const { mutate } = useSWRConfig()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<BeneficiarioDetail | null>(null)
  const [editError, setEditError] = useState('')
  const [removeMessage, setRemoveMessage] = useState('')
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const params: Record<string, string | number> = { page, limit: 20 }
  if (search) params.search = search
  if (statusFilter) params.status = statusFilter

  const { data, isLoading, isValidating, error: loadError, mutate: refreshBeneficiarios } = useSWR(
    ['/beneficiarios', params],
    () => beneficiariosService.list(params),
    { keepPreviousData: true, refreshInterval: 15000 },
  )

  const { data: detail, mutate: mutateDetail } = useSWR(
    detailId ? `/beneficiarios/${detailId}` : null,
    () => beneficiariosService.get(detailId!),
  )

  const { data: projectsData } = useSWR('/projects-all', () =>
    projectsService.list({ limit: 100, include_legacy: 'true' }),
  )
  const projects = projectsData?.data ?? []

  async function handleCreate(dto: CreateBeneficiarioInput) {
    if (editItem) {
      await beneficiariosService.update(editItem.id, dto as Record<string, unknown>)
    } else {
      await beneficiariosService.create(dto as Record<string, unknown>)
    }
    mutate(['/beneficiarios', params])
    setShowForm(false)
    setEditItem(null)
  }

  async function handleDelete(b: Beneficiario) {
    if (!confirm(`Excluir o cadastro de ${b.name}? O aluno sairá da lista, de turmas e de projetos ativos.`)) return
    setEditError('')
    setRemoveMessage('')
    setRemovingId(b.id)
    try {
      await beneficiariosService.remove(b.id)
      if (detailId === b.id) setDetailId(null)
      await mutate(['/beneficiarios', params])
      setRemoveMessage(`Cadastro de ${b.name} excluído.`)
    } catch (error) {
      const responseMessage = axios.isAxiosError(error) ? error.response?.data?.message : undefined
      setEditError(Array.isArray(responseMessage) ? responseMessage.join('. ') : typeof responseMessage === 'string' ? responseMessage : 'Não foi possível excluir o cadastro. Tente novamente.')
    } finally {
      setRemovingId(null)
    }
  }

  async function openEdit(b: Beneficiario) {
    setEditError('')
    setLoadingEditId(b.id)
    try {
      const complete = await beneficiariosService.get(b.id)
      setEditItem(complete)
      setShowForm(true)
    } catch {
      setEditError('Não foi possível carregar os dados do beneficiário para edição. Tente novamente.')
    } finally {
      setLoadingEditId(null)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Beneficiários</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {data?.total ?? 0} pessoa{data?.total !== 1 ? 's' : ''} cadastrada{data?.total !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => refreshBeneficiarios()} disabled={isValidating} className="btn-ghost disabled:opacity-40">
              {isValidating ? 'Atualizando...' : 'Atualizar cadastros'}
            </button>
            {typeof router.query.tenant === 'string' && <Link href={`/${router.query.tenant}/matriculas`} className="btn-ghost">Turmas e vagas</Link>}
            <button
              onClick={() => { setEditItem(null); setShowForm(true) }}
              className="btn-primary flex items-center gap-2"
            >
              <PlusCircle className="h-4 w-4" />
              Novo beneficiário
            </button>
          </div>
        </div>
        {editError && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{editError}</div>}
        {removeMessage && <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{removeMessage}</div>}
        {loadError && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Não foi possível atualizar os cadastros. <button type="button" onClick={() => refreshBeneficiarios()} className="font-medium underline">Tentar novamente</button></div>}

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
            {BENEFICIARY_STATUSES.map((s) => (
              <option key={s} value={s}>{BENEFICIARY_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {/* Student summaries */}
        <div>
          {isLoading ? (
            <PageSpinner />
          ) : !data && loadError ? null : !data?.data.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-12 w-12 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-brand-600" />
              </div>
              <p className="text-sm font-medium text-gray-900">Nenhum beneficiário encontrado</p>
              <p className="text-xs text-gray-500 mt-1">Clique em &ldquo;Novo beneficiário&rdquo; para cadastrar.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.data.map((b) => {
                const age = getAge(b.birth_date)
                return (
                  <article key={b.id} className="card group p-5 hover:border-brand-200 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <button onClick={() => setDetailId(detailId === b.id ? null : b.id)} className="flex min-w-0 items-center gap-3 text-left">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                          {b.name.split(' ').slice(0, 2).map((part) => part[0]).join('')}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-gray-900 group-hover:text-brand-700">{b.name}</span>
                          <span className="block text-xs text-gray-500">{age != null ? `${age} anos` : 'Idade não informada'} · {b.serie_ano ?? 'Série não informada'}</span>
                        </span>
                      </button>
                      <Badge value={b.status} />
                    </div>

                    <div className="mt-4 space-y-2.5 text-sm text-gray-600">
                      <p className="flex items-center gap-2"><School className="h-4 w-4 text-gray-400" /><span className="truncate">{b.turma ?? 'Sem turma'}{b.turno ? ` · ${b.turno}` : ''}</span></p>
                      <p className="flex items-center gap-2"><FolderKanban className="h-4 w-4 text-gray-400" /><span className="truncate">{b.project?.name ?? 'Sem projeto principal'}</span></p>
                      <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-gray-400" /><span>{b.telefone ?? 'Contato não informado'}</span></p>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3 text-center">
                      <div><p className="text-base font-semibold text-gray-900">{b._count.responsaveis}</p><p className="text-[11px] text-gray-500">responsáveis</p></div>
                      <div><p className="text-base font-semibold text-gray-900">{b._count.vinculos_projetos}</p><p className="text-[11px] text-gray-500">projetos</p></div>
                      <div><ShieldCheck className={`mx-auto h-5 w-5 ${b.termo_consentimento ? 'text-emerald-600' : 'text-amber-500'}`} /><p className="text-[11px] text-gray-500">LGPD</p></div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                      <button onClick={() => setDetailId(b.id)} className="text-sm font-medium text-brand-700 hover:text-brand-800">Ver perfil completo</button>
                      <div className="flex gap-1">
                        <button aria-label={`Editar ${b.name}`} onClick={() => openEdit(b)} disabled={loadingEditId === b.id} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 disabled:opacity-50"><Edit2 className="h-4 w-4" /></button>
                        <button aria-label={`Excluir cadastro de ${b.name}`} title="Excluir cadastro" onClick={() => handleDelete(b)} disabled={removingId === b.id} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
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
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="btn-ghost disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= data.totalPages}
                className="btn-ghost disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cadastro / Edição modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditItem(null) }}
        title={editItem ? `Editar: ${editItem.name}` : 'Novo beneficiário'}
        size="lg"
      >
        <BeneficiarioForm
          key={editItem?.id ?? 'new'}
          defaultValues={editItem ? editDefaults(editItem) : undefined}
          projects={projects}
          onSubmit={handleCreate}
          onClose={() => { setShowForm(false); setEditItem(null) }}
        />
      </Modal>

      {/* Detalhe drawer */}
      {detailId && detail && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setDetailId(null)} />
          <DetailDrawer
            beneficiario={detail}
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
