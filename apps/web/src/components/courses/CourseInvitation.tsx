import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Head from 'next/head'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import axios from 'axios'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, GraduationCap, HeartHandshake, LockKeyhole, School, Users } from 'lucide-react'
import { publicApi } from '@/lib/api'
import { getCourseVisual, invitationRole, type InvitationRole } from './course-visual'
import type { InvitationProps, PublicInvitation } from './invitation-types'

type Form = {
  solicitante_tipo: InvitationRole | ''
  solicitante_nome: string
  solicitante_contato: string
  parentesco: string
  aluno_nome: string
  aluno_nascimento: string
  aluno_cpf: string
  turma_id: string
  consentimento: boolean
}
const initialForm: Form = {
  solicitante_tipo: '', solicitante_nome: '', solicitante_contato: '', parentesco: '',
  aluno_nome: '', aluno_nascimento: '', aluno_cpf: '', turma_id: '', consentimento: false,
}
const steps = ['Quem está preenchendo', 'Dados do aluno', 'Confirmar']

function messageFrom(error: unknown) {
  const message = axios.isAxiosError(error) ? error.response?.data?.message : undefined
  return Array.isArray(message) ? message.join('. ') : typeof message === 'string' ? message : 'Não foi possível enviar a inscrição. Tente novamente.'
}

export default function CourseInvitation({ initialData, initialCourseId = '', initialTenant = '', shareOrigin = '' }: InvitationProps) {
  const router = useRouter()
  const slug = typeof router.query.tenant === 'string' ? router.query.tenant : initialTenant
  const courseId = typeof router.query.curso === 'string' ? router.query.curso : ''
  const classId = typeof router.query.turma === 'string' ? router.query.turma : ''
  const preferredRole = invitationRole(router.query.perfil)
  const classesUrl = `/enrollment/${slug}/classes${courseId ? `?curso=${encodeURIComponent(courseId)}` : ''}`
  const { data, error: loadError, mutate } = useSWR<PublicInvitation>(
    slug ? classesUrl : null,
    () => publicApi.get(classesUrl).then(response => response.data),
    { refreshInterval: 15000, fallbackData: initialTenant === slug && initialCourseId === courseId ? initialData ?? undefined : undefined },
  )
  const [form, setForm] = useState<Form>({ ...initialForm, solicitante_tipo: preferredRole })
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [started, setStarted] = useState(false)
  const [result, setResult] = useState<{ turma: string; status: 'ATIVA' | 'EM_ESPERA'; posicao_espera: number | null } | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  const visual = getCourseVisual(data?.course?.nome, data?.course?.tema_visual)
  const availableClasses = data?.classes.filter(item => !classId || item.id === classId)
  const effectiveClassId = form.turma_id || (availableClasses?.length === 1 ? availableClasses[0].id : '')
  const selectedClass = availableClasses?.find(item => item.id === effectiveClassId)
  const vacancies = availableClasses?.reduce((total, item) => total + item.vagas, 0) ?? 0
  const unavailable = !!data && !availableClasses?.length
  const title = data?.course?.nome ?? (courseId ? 'Sua atividade' : 'Inscrição')
  const canonical = `${shareOrigin}/${encodeURIComponent(slug)}/inscricao${courseId ? `?curso=${encodeURIComponent(courseId)}` : ''}${classId ? `${courseId ? '&' : '?'}turma=${encodeURIComponent(classId)}` : ''}`
  const description = data?.course?.descricao || `Inscreva-se em ${title}${data?.organization ? ` com ${data.organization}` : ''}.`

  useEffect(() => {
    setForm({ ...initialForm, solicitante_tipo: preferredRole })
    setStep(0)
    setStarted(false)
    setResult(null)
    setError('')
  }, [courseId, classId, preferredRole, slug])
  useEffect(() => { if (started) heading.current?.focus() }, [step, started, result])

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm(current => ({ ...current, [key]: value }))
    setError('')
  }
  function next() {
    if (step === 0) {
      if (!form.solicitante_tipo || form.solicitante_nome.trim().length < 2 || form.solicitante_contato.trim().length < 5 || (form.solicitante_tipo === 'RESPONSAVEL' && !form.parentesco)) {
        setError('Selecione aluno ou responsável e informe nome, contato e parentesco quando necessário.')
        return
      }
      if (form.solicitante_tipo === 'ALUNO' && !form.aluno_nome) {
        setForm(current => ({ ...current, aluno_nome: current.solicitante_nome.trim() }))
      }
    }
    if (step === 1 && (
      form.aluno_nome.trim().length < 2 ||
      !form.aluno_nascimento ||
      new Date(form.aluno_nascimento) > new Date() ||
      (form.aluno_cpf.replace(/\D/g, '').length !== 0 && form.aluno_cpf.replace(/\D/g, '').length !== 11)
    )) {
      setError('Confira o nome e o nascimento do aluno. Se informar CPF, use 11 dígitos.')
      return
    }
    setStarted(true)
    setError('')
    setStep(current => current + 1)
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (step < 2) { next(); return }
    if (!selectedClass) { setError('Selecione uma turma para continuar.'); return }
    if (!form.consentimento) { setError('Confirme a autorização para enviar a inscrição.'); return }
    if (!data || loadError) { setError('Esta turma não está disponível no momento. Tente novamente.'); return }
    setSending(true)
    setError('')
    try {
      const { data: response } = await publicApi.post(`/enrollment/${slug}/apply`, {
        ...form,
        curso_id: courseId || undefined,
        turma_id: selectedClass.id,
        aluno_cpf: form.aluno_cpf.replace(/\D/g, '') || undefined,
        parentesco: form.solicitante_tipo === 'RESPONSAVEL' ? form.parentesco : undefined,
      })
      setResult(response)
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setSending(false)
    }
  }

  return <div className="course-invite" style={{ '--invite-accent': visual.color, '--invite-deep': visual.deep, '--invite-pale': visual.pale } as CSSProperties}>
    <Head>
      <title>{`Inscrição em ${title} | ${data?.organization ?? 'Amparo GOV'}`}</title>
      <meta key="description" name="description" content={description.slice(0, 250)} />
      <meta name="theme-color" content={visual.deep} key="app-theme" />
      <meta property="og:type" content="website" /><meta property="og:locale" content="pt_BR" />
      <meta property="og:title" content={`${title} | ${data?.organization ?? 'Amparo GOV'}`} />
      <meta property="og:description" content={description.slice(0, 250)} />
      <meta property="og:image" content={`${shareOrigin}${visual.src}`} />
      <meta property="og:image:alt" content={visual.alt} />
      <meta property="og:url" content={canonical} /><meta name="twitter:card" content="summary_large_image" />
      {shareOrigin && <link rel="canonical" href={canonical} />}
    </Head>
    <header className="invite-topbar">
      <div><Image src="/amparo/logo-principal.png" alt="Amparo GOV" width={2180} height={721} priority className="invite-logo" /><span className="invite-top-divider" /><span className="invite-organization">{data?.organization ?? 'Inscrição on-line'}</span></div>
      <span className="invite-online"><span />Inscrição on-line</span>
    </header>
    <main className="invite-container">
      <section className="invite-hero">
        <div className="invite-hero-copy">
          <span className="invite-eyebrow">INSCRIÇÃO ON-LINE</span>
          <h1>{title}</h1>
          <p>{selectedClass ? `Turma: ${selectedClass.nome}` : 'Preencha os dados para participar da atividade.'}</p>
          {!unavailable && <a href="#invite-form" className="invite-btn invite-btn-light" onClick={() => setStarted(true)}>{result ? 'Ver confirmação' : 'Começar inscrição'}<ArrowRight size={18} /></a>}
        </div>
        <figure className="invite-cover"><Image src={visual.src} alt={visual.alt} fill priority sizes="(max-width: 700px) 100vw, 480px" quality={82} /><figcaption>Imagem ilustrativa</figcaption></figure>
      </section>
      <div className="invite-facts">
        <div><School size={19} /><span>{selectedClass ? <><strong>{selectedClass.nome}</strong> já selecionada</> : <><strong>{availableClasses?.length ?? '—'}</strong> {availableClasses?.length === 1 ? 'turma' : 'turmas'} para escolher</>}</span></div>
        <div><Users size={19} /><span>{!data ? 'Consultando vagas' : unavailable ? 'Turma indisponível' : vacancies ? <><strong>{vacancies}</strong> {vacancies === 1 ? 'vaga disponível' : 'vagas disponíveis'}</> : 'Inscrições na lista de reserva'}</span></div>
      </div>
      <section className="invite-form-card" id="invite-form" aria-label="Formulário de inscrição">
        {result ? <div className="invite-success" role="status">
          <span className="invite-success-icon"><CheckCircle2 size={40} /></span>
          <h2 ref={heading} tabIndex={-1}>Inscrição recebida!</h2>
          <p>A inscrição de <strong>{form.aluno_nome}</strong> em {data?.course?.nome ?? 'uma atividade'} chegou à instituição.</p>
          <div className={`invite-result ${result.status === 'EM_ESPERA' ? 'is-waiting' : ''}`}>
            <strong>{result.status === 'ATIVA' ? 'Matrícula confirmada' : 'Aluno na lista de reserva'}</strong>
            <p>Turma: {result.turma}</p>
            {result.status === 'EM_ESPERA' && <p>A turma está completa. Posição na lista: {result.posicao_espera ?? 'a confirmar'}.</p>}
          </div>
          <p className="invite-small">Guarde esta confirmação. Para acompanhar a inscrição, fale com {data?.organization ?? 'a instituição'}.</p>
        </div> : <>
          <div className="invite-form-heading">
            <span className="invite-eyebrow">FORMULÁRIO DE INSCRIÇÃO</span>
            <h2>Inscreva-se em {title}</h2>
            <p>{selectedClass ? `Turma ${selectedClass.nome} ${classId ? 'selecionada pelo link' : 'disponível para inscrição'}.` : 'Leva apenas alguns minutos. Campos com * são obrigatórios.'}</p>
          </div>
          {loadError ? <div className="invite-state"><p role="alert">Não foi possível carregar as turmas. O link pode estar indisponível ou as inscrições encerradas.</p><button type="button" className="invite-btn invite-btn-outline" onClick={() => void mutate()}>Tentar novamente</button></div>
          : !data ? <p role="status" className="invite-state">Carregando formulário...</p>
          : unavailable ? <div className="invite-state"><School size={32} /><h3>{classId ? 'Esta turma não está disponível neste link' : 'Ainda não há turmas abertas'}</h3><p>Peça à instituição um novo link para inscrição.</p></div>
          : <>
            <ol className="invite-steps" aria-label="Etapas da inscrição">{steps.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={index < step ? 'is-complete' : index === step ? 'is-current' : ''}><span>{index < step ? <Check size={14} /> : index + 1}</span><small>{label}</small></li>)}</ol>
            <form onSubmit={submit} noValidate>
              <div className="invite-step-heading"><span>ETAPA {step + 1} DE 3</span><h3 ref={heading} tabIndex={-1}>{step === 0 ? 'Quem vai preencher?' : step === 1 ? 'Dados do aluno' : 'Confira e envie'}</h3><p>{step === 0 ? 'Escolha uma opção e informe um contato.' : step === 1 ? 'Use os dados como aparecem no documento do aluno.' : 'Revise os dados antes de enviar.'}</p></div>
              {error && <p role="alert" className="invite-error">{error}</p>}
              {step === 0 && <div className="invite-fields">
                <div className="invite-roles">{([
                  { value: 'RESPONSAVEL', label: 'Sou responsável', detail: 'Vou inscrever um aluno', icon: HeartHandshake },
                  { value: 'ALUNO', label: 'Sou o aluno', detail: 'Vou me inscrever', icon: GraduationCap },
                ] as const).map(({ value, label, detail, icon: Icon }) => <button key={value} type="button" aria-pressed={form.solicitante_tipo === value} onClick={() => update('solicitante_tipo', value)}><Icon size={23} /><strong>{label}</strong><small>{detail}</small>{form.solicitante_tipo === value && <CheckCircle2 className="invite-role-check" size={17} />}</button>)}</div>
                <label className="invite-field"><span>Seu nome completo *</span><input value={form.solicitante_nome} onChange={event => update('solicitante_nome', event.target.value)} autoComplete="name" aria-required maxLength={200} placeholder="Digite seu nome completo" /></label>
                <label className="invite-field"><span>Telefone com DDD ou e-mail *</span><input value={form.solicitante_contato} onChange={event => update('solicitante_contato', event.target.value)} autoComplete="tel" aria-required maxLength={120} placeholder="Para receber contato da instituição" /></label>
                {form.solicitante_tipo === 'RESPONSAVEL' && <label className="invite-field"><span>Relação com o aluno *</span><select value={form.parentesco} onChange={event => update('parentesco', event.target.value)} aria-required><option value="">Selecione</option>{[['MAE','Mãe'],['PAI','Pai'],['AVO','Avô ou avó'],['TIO','Tio ou tia'],['TUTOR_LEGAL','Tutor legal'],['OUTRO','Outro']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
              </div>}
              {step === 1 && <div className="invite-fields">
                <label className="invite-field"><span>Nome completo do aluno *</span><input value={form.aluno_nome} onChange={event => update('aluno_nome', event.target.value)} autoComplete="off" aria-required maxLength={200} placeholder="Como aparece no documento" /></label>
                <div className="invite-field-grid">
                  <label className="invite-field"><span>Data de nascimento *</span><input type="date" max={new Date().toISOString().slice(0, 10)} value={form.aluno_nascimento} onChange={event => update('aluno_nascimento', event.target.value)} aria-required /></label>
                  <label className="invite-field"><span>CPF do aluno (opcional)</span><input inputMode="numeric" value={form.aluno_cpf} onChange={event => update('aluno_cpf', event.target.value)} placeholder="11 dígitos, se tiver" maxLength={14} /></label>
                </div>
                <p className="invite-small">O aluno pode se inscrever mesmo sem CPF.</p>
              </div>}
              {step === 2 && <div className="invite-fields">
                {availableClasses && availableClasses.length > 1 ? <div className="invite-class-options"><p className="invite-choice-label">Escolha a turma *</p>{availableClasses.map(item => <button type="button" key={item.id} aria-pressed={form.turma_id === item.id} onClick={() => update('turma_id', item.id)}><span className="invite-class-radio">{form.turma_id === item.id && <span />}</span><span><strong>{item.nome}</strong>{!data.course && item.curso?.nome && <small>{item.curso.nome}</small>}<span className={`invite-class-status${!item.vagas ? ' is-waiting' : ''}`}>{item.vagas ? `${item.vagas} ${item.vagas === 1 ? 'vaga disponível' : 'vagas disponíveis'}` : 'Lista de reserva'}</span></span><ChevronRight size={17} /></button>)}</div> : null}
                <dl className="invite-review"><div><dt>Aluno</dt><dd>{form.aluno_nome}</dd></div><div><dt>Atividade</dt><dd>{data.course?.nome ?? selectedClass?.curso?.nome ?? 'Inscrição'}</dd></div><div><dt>Turma</dt><dd>{selectedClass?.nome ?? 'Selecione acima'}</dd></div><div><dt>Contato</dt><dd>{form.solicitante_contato}</dd></div></dl>
                <p className="invite-small">{selectedClass?.vagas ? 'A confirmação da vaga será mostrada após o envio.' : 'Esta turma está completa. A inscrição entrará na lista de reserva.'}</p>
                <label className="invite-consent"><input type="checkbox" checked={form.consentimento} onChange={event => update('consentimento', event.target.checked)} /><span>Confirmo que os dados estão corretos e que tenho autorização para enviá-los à instituição para inscrição e acompanhamento do aluno. *</span></label>
              </div>}
              <div className="invite-actions">
                {step > 0 ? <button type="button" className="invite-back" disabled={sending} onClick={() => { setStarted(true); setStep(current => current - 1); setError('') }}><ArrowLeft size={16} />Voltar</button> : <span />}
                <button type="submit" disabled={sending} className="invite-btn invite-btn-primary">{sending ? 'Enviando...' : step < 2 ? 'Continuar' : 'Enviar inscrição'}{!sending && <ArrowRight size={17} />}</button>
              </div>
              <p className="invite-form-footer"><LockKeyhole size={13} />Seus dados são enviados à instituição responsável pela atividade.</p>
            </form>
          </>}
        </>}
      </section>
      <footer className="invite-footer"><Image src="/amparo/icone-app.png" alt="" width={24} height={24} /><span>Inscrições organizadas com Amparo GOV</span><span>{data?.organization}</span></footer>
    </main>
  </div>
}
