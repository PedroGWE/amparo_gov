import { FormEvent, useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import axios from 'axios'
import { ArrowLeft, ArrowRight, CheckCircle2, GraduationCap, HeartHandshake, School } from 'lucide-react'
import { publicApi } from '@/lib/api'

type ApplicantRole = 'RESPONSAVEL' | 'PROFESSOR' | 'ALUNO'
type ClassOption = { id: string; nome: string; capacidade: number; vagas: number; curso?: { id: string; nome: string } | null; project: { name: string } | null }
type Form = {
  solicitante_tipo: ApplicantRole | ''
  solicitante_nome: string
  solicitante_contato: string
  parentesco: string
  aluno_nome: string
  aluno_nascimento: string
  aluno_cpf: string
  aluno_telefone: string
  aluno_email: string
  turma_id: string
  consentimento: boolean
}

const initialForm: Form = { solicitante_tipo: '', solicitante_nome: '', solicitante_contato: '', parentesco: '', aluno_nome: '', aluno_nascimento: '', aluno_cpf: '', aluno_telefone: '', aluno_email: '', turma_id: '', consentimento: false }
const steps = ['Quem preenche', 'Dados do aluno', 'Turma', 'Confirmar']

function messageFrom(error: unknown) {
  const message = axios.isAxiosError(error) ? error.response?.data?.message : undefined
  return Array.isArray(message) ? message.join('. ') : typeof message === 'string' ? message : 'Não foi possível enviar a inscrição. Tente novamente.'
}

export default function InscricaoPage() {
  const router = useRouter()
  const slug = typeof router.query.tenant === 'string' ? router.query.tenant : ''
  const courseId = typeof router.query.curso === 'string' ? router.query.curso : ''
  const classId = typeof router.query.turma === 'string' ? router.query.turma : ''
  const classesUrl = `/enrollment/${slug}/classes${courseId ? `?curso=${encodeURIComponent(courseId)}` : ''}`
  const { data, error: loadError } = useSWR(slug ? classesUrl : null,
    () => publicApi.get(classesUrl).then((response) => response.data as { organization: string; course: { id: string; nome: string } | null; classes: ClassOption[] }),
    { refreshInterval: 15000 },
  )
  const [form, setForm] = useState<Form>(initialForm)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ turma: string; status: 'ATIVA' | 'EM_ESPERA'; posicao_espera: number | null } | null>(null)
  const selectedClass = data?.classes.find((turma) => turma.id === form.turma_id)
  const availableClasses = data?.classes.filter(turma => !classId || turma.id === classId)

  useEffect(() => { setForm(initialForm); setStep(0); setResult(null); setError('') }, [courseId, classId])

  useEffect(() => {
    if (classId && data?.classes.some(turma => turma.id === classId)) setForm(current => ({ ...current, turma_id: classId }))
  }, [classId, data])


  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function next() {
    if (step === 0 && (!form.solicitante_tipo || form.solicitante_nome.trim().length < 2 || form.solicitante_contato.trim().length < 5 || (form.solicitante_tipo === 'RESPONSAVEL' && !form.parentesco))) {
      setError('Informe quem está preenchendo, nome, contato e parentesco quando necessário.')
      return
    }
    if (step === 1 && (form.aluno_nome.trim().length < 2 || !form.aluno_nascimento || new Date(form.aluno_nascimento) > new Date() || (form.aluno_cpf.replace(/\D/g, '').length !== 0 && form.aluno_cpf.replace(/\D/g, '').length !== 11))) {
      setError('Confira o nome e a data de nascimento do aluno. Se informar CPF, use 11 dígitos.')
      return
    }
    if (step === 2 && !availableClasses?.some(turma => turma.id === form.turma_id)) {
      setError('Selecione uma turma para continuar.')
      return
    }
    setError('')
    setStep(step + 1)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!form.consentimento) { setError('Confirme o consentimento para enviar a inscrição.'); return }
    setSending(true)
    setError('')
    try {
      const { data: response } = await publicApi.post(`/enrollment/${slug}/apply`, {
        ...form,
        curso_id: courseId || undefined,
        aluno_cpf: form.aluno_cpf.replace(/\D/g, '') || undefined,
        aluno_telefone: form.aluno_telefone.trim() || undefined,
        aluno_email: form.aluno_email.trim() || undefined,
        parentesco: form.solicitante_tipo === 'RESPONSAVEL' ? form.parentesco : undefined,
      })
      setResult(response)
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setSending(false)
    }
  }

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ECF2FA,_#F5F8FC_55%)] px-4 py-8 sm:py-12">
    <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-[#D5DEEA] bg-white shadow-[0_18px_50px_rgb(20_47_84/0.12)]">
      <div className="border-b border-[#D5DEEA] bg-white px-6 py-5 sm:px-8"><Image src="/amparo/logo-principal.png" alt="Amparo GOV" width={2180} height={721} priority className="h-auto w-40" /><h1 className="mt-3 text-2xl font-bold text-brand-900">{data?.course ? `Matrícula · ${data.course.nome}` : 'Inscrição de aluno'}</h1><p className="mt-1 text-sm text-gray-600">{data?.organization || 'Organização'} · Preencha com calma. Leva poucos minutos.</p></div>
      <div className="p-6 sm:p-8">
        {result ? <div className="space-y-4 text-center"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" /><h2 className="text-xl font-semibold text-gray-900">Inscrição recebida</h2><p className="text-gray-600">Turma: <strong>{result.turma}</strong></p>{result.status === 'ATIVA' ? <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">A matrícula foi confirmada dentro das vagas disponíveis.</p> : <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">A turma está completa. O aluno entrou na lista de espera{result.posicao_espera ? ` na posição ${result.posicao_espera}` : ''}.</p>}<p className="text-xs text-gray-500">Guarde esta confirmação. Em caso de dúvida, fale com a organização.</p></div> : <>
          <ol className="mb-6 grid grid-cols-4 gap-1" aria-label="Etapas da inscrição">{steps.map((label, index) => <li key={label} className={`rounded-lg px-1 py-2 text-center text-[11px] font-medium sm:text-xs ${index === step ? 'bg-brand-600 text-white' : index < step ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>{index + 1}. {label}</li>)}</ol>
          {loadError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Não foi possível carregar as turmas. O link pode estar indisponível ou as inscrições encerradas. Fale com a organização.</p>}
          {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <form onSubmit={submit} className="space-y-5">
            {step === 0 && <div className="space-y-4"><div><h2 className="font-semibold text-gray-900">Quem está preenchendo?</h2><p className="text-sm text-gray-500">Escolha a opção que melhor descreve você.</p></div><div className="grid gap-3 sm:grid-cols-3">{([{ value: 'RESPONSAVEL', label: 'Mãe, pai ou responsável', icon: HeartHandshake }, { value: 'PROFESSOR', label: 'Professor', icon: School }, { value: 'ALUNO', label: 'Aluno', icon: GraduationCap }] as const).map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => update('solicitante_tipo', value)} className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center text-sm font-medium ${form.solicitante_tipo === value ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-gray-200 text-gray-600 hover:border-brand-300'}`}><Icon className="h-6 w-6" />{label}</button>)}</div><label className="block text-sm text-gray-700">Seu nome completo *<input className="input mt-1 w-full" value={form.solicitante_nome} onChange={(event) => update('solicitante_nome', event.target.value)} autoComplete="name" maxLength={200} /></label><label className="block text-sm text-gray-700">Telefone ou e-mail para contato *<input className="input mt-1 w-full" value={form.solicitante_contato} onChange={(event) => update('solicitante_contato', event.target.value)} maxLength={120} /></label>{form.solicitante_tipo === 'RESPONSAVEL' && <label className="block text-sm text-gray-700">Parentesco com o aluno *<select className="input mt-1 w-full" value={form.parentesco} onChange={(event) => update('parentesco', event.target.value)}><option value="">Selecione</option><option value="MAE">Mãe</option><option value="PAI">Pai</option><option value="AVO">Avô ou avó</option><option value="TIO">Tio ou tia</option><option value="TUTOR_LEGAL">Tutor legal</option><option value="OUTRO">Outro</option></select></label>}</div>}
            {step === 1 && <div className="space-y-4"><div><h2 className="font-semibold text-gray-900">Dados do aluno</h2><p className="text-sm text-gray-500">Use o nome como aparece nos documentos.</p></div><label className="block text-sm text-gray-700">Nome completo *<input className="input mt-1 w-full" value={form.aluno_nome} onChange={(event) => update('aluno_nome', event.target.value)} autoComplete="off" maxLength={200} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm text-gray-700">Data de nascimento *<input className="input mt-1 w-full" type="date" max={new Date().toISOString().slice(0, 10)} value={form.aluno_nascimento} onChange={(event) => update('aluno_nascimento', event.target.value)} /></label><label className="block text-sm text-gray-700">CPF, se tiver<input className="input mt-1 w-full" inputMode="numeric" value={form.aluno_cpf} onChange={(event) => update('aluno_cpf', event.target.value)} placeholder="Somente números" maxLength={14} /></label><label className="block text-sm text-gray-700">Telefone do aluno, se tiver<input className="input mt-1 w-full" value={form.aluno_telefone} onChange={(event) => update('aluno_telefone', event.target.value)} maxLength={30} /></label><label className="block text-sm text-gray-700">E-mail do aluno, se tiver<input className="input mt-1 w-full" type="email" value={form.aluno_email} onChange={(event) => update('aluno_email', event.target.value)} /></label></div></div>}
            {step === 2 && <div className="space-y-4"><div><h2 className="font-semibold text-gray-900">Escolha a turma</h2><p className="text-sm text-gray-500">Quando não há vagas, a inscrição entra automaticamente na lista de espera.</p></div>{!data && !loadError && <p className="text-sm text-gray-500">Carregando turmas...</p>}{availableClasses?.length === 0 && <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Ainda não há turmas abertas para inscrição. Fale com a organização.</p>}<div className="space-y-3">{availableClasses?.map((turma) => <button type="button" key={turma.id} onClick={() => update('turma_id', turma.id)} className={`w-full rounded-xl border p-4 text-left ${form.turma_id === turma.id ? 'border-brand-600 bg-brand-50' : 'border-gray-200 hover:border-brand-300'}`}><span className="block font-medium text-gray-900">{turma.nome}</span><span className="text-xs text-gray-500">{turma.curso?.nome ? `${turma.curso.nome} · ` : ''}{turma.project?.name ? `${turma.project.name} · ` : ''}{turma.vagas > 0 ? `${turma.vagas} vaga${turma.vagas === 1 ? '' : 's'} disponível${turma.vagas === 1 ? '' : 'is'}` : 'Lista de espera'}</span></button>)}</div></div>}
            {step === 3 && <div className="space-y-4"><h2 className="font-semibold text-gray-900">Revise e confirme</h2><div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700"><p><strong>Aluno:</strong> {form.aluno_nome}</p><p><strong>Turma:</strong> {selectedClass?.nome}</p><p><strong>Quem preenche:</strong> {form.solicitante_nome}</p><p><strong>Situação prevista:</strong> {selectedClass?.vagas ? 'Vaga disponível' : 'Lista de espera'}</p></div><p className="text-xs text-gray-500">A situação final será definida no momento do envio, conforme as vagas disponíveis.</p><label className="flex items-start gap-3 text-sm text-gray-700"><input type="checkbox" checked={form.consentimento} onChange={(event) => update('consentimento', event.target.checked)} className="mt-1" /><span>Confirmo que os dados estão corretos e que tenho autorização para enviá-los à organização para a inscrição e acompanhamento do aluno. *</span></label></div>}
            <div className="flex items-center justify-between border-t border-gray-100 pt-5"><button type="button" disabled={step === 0 || sending} onClick={() => { setStep(step - 1); setError('') }} className="btn-ghost inline-flex items-center gap-1 disabled:opacity-40"><ArrowLeft className="h-4 w-4" /> Voltar</button>{step < steps.length - 1 ? <button type="button" onClick={next} className="btn-primary inline-flex items-center gap-1">Continuar <ArrowRight className="h-4 w-4" /></button> : <button type="submit" disabled={sending} className="btn-primary">{sending ? 'Enviando...' : 'Enviar inscrição'}</button>}</div>
          </form>
        </>}
      </div>
    </div>
  </div>
}
