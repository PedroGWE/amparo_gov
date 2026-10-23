import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Head from 'next/head'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import axios from 'axios'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, ClipboardCheck, GraduationCap, HeartHandshake, LockKeyhole, School, Users } from 'lucide-react'
import { publicApi } from '@/lib/api'
import { getCourseVisual, invitationRole, type InvitationRole } from './course-visual'
import type { InvitationProps, PublicInvitation } from './invitation-types'

type Form = { solicitante_tipo: InvitationRole | ''; solicitante_nome: string; solicitante_contato: string; parentesco: string; aluno_nome: string; aluno_nascimento: string; aluno_cpf: string; aluno_telefone: string; aluno_email: string; turma_id: string; consentimento: boolean }
const initialForm: Form = { solicitante_tipo: '', solicitante_nome: '', solicitante_contato: '', parentesco: '', aluno_nome: '', aluno_nascimento: '', aluno_cpf: '', aluno_telefone: '', aluno_email: '', turma_id: '', consentimento: false }
const steps = ['Quem preenche', 'Dados do aluno', 'Sua turma', 'Confirmar']
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
  const { data, error: loadError, mutate } = useSWR<PublicInvitation>(slug ? classesUrl : null, () => publicApi.get(classesUrl).then(response => response.data), { refreshInterval: 15000, fallbackData: initialTenant === slug && initialCourseId === courseId ? initialData ?? undefined : undefined })
  const [form, setForm] = useState<Form>({ ...initialForm, solicitante_tipo: preferredRole })
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [started, setStarted] = useState(false)
  const [result, setResult] = useState<{ turma: string; status: 'ATIVA' | 'EM_ESPERA'; posicao_espera: number | null } | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const visual = getCourseVisual(data?.course?.nome, data?.course?.tema_visual)
  const availableClasses = data?.classes.filter(item => !classId || item.id === classId)
  const selectedClass = availableClasses?.find(item => item.id === form.turma_id)
  const vacancies = availableClasses?.reduce((total, item) => total + item.vagas, 0) ?? 0
  const unavailable = !!data && !availableClasses?.length
  const title = data?.course?.nome ?? (courseId ? 'Seu convite' : 'Novas possibilidades')
  const formTitle = data?.course ? `Matrícula · ${data.course.nome}` : 'Inscrição de aluno'
  const canonical = `${shareOrigin}/${encodeURIComponent(slug)}/inscricao${courseId ? `?curso=${encodeURIComponent(courseId)}` : ''}${classId ? `${courseId ? '&' : '?'}turma=${encodeURIComponent(classId)}` : ''}`
  const description = data?.course?.descricao || `${visual.headline} Conheça as turmas e faça sua inscrição${data?.organization ? ` em ${data.organization}` : ''}.`

  useEffect(() => { setForm({ ...initialForm, solicitante_tipo: preferredRole }); setStep(0); setStarted(false); setResult(null); setError('') }, [courseId, classId, preferredRole, slug])
  useEffect(() => {
    if (classId && data?.classes.some(item => item.id === classId)) setForm(current => ({ ...current, turma_id: classId }))
  }, [classId, data])
  useEffect(() => { if (started) heading.current?.focus() }, [step, started, result])

  function update<K extends keyof Form>(key: K, value: Form[K]) { setForm(current => ({ ...current, [key]: value })); setError('') }
  function next() {
    if (step === 0 && (!form.solicitante_tipo || form.solicitante_nome.trim().length < 2 || form.solicitante_contato.trim().length < 5 || (form.solicitante_tipo === 'RESPONSAVEL' && !form.parentesco))) { setError('Informe quem está preenchendo, nome, contato e parentesco quando necessário.'); return }
    if (step === 1 && (form.aluno_nome.trim().length < 2 || !form.aluno_nascimento || new Date(form.aluno_nascimento) > new Date() || (form.aluno_cpf.replace(/\D/g, '').length !== 0 && form.aluno_cpf.replace(/\D/g, '').length !== 11) || (!!form.aluno_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.aluno_email)))) { setError('Confira o nome e a data de nascimento do aluno. Se informar CPF, use 11 dígitos. Confira também o e-mail, se preenchido.'); return }
    if (step === 2 && !selectedClass) { setError('Selecione uma turma para continuar.'); return }
    if (step === 0 && form.solicitante_tipo === 'ALUNO' && !form.aluno_nome) setForm(current => ({ ...current, aluno_nome: current.solicitante_nome }))
    setStarted(true); setError(''); setStep(current => current + 1)
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (step < 3) { next(); return }
    if (!form.consentimento) { setError('Confirme o consentimento para enviar a inscrição.'); return }
    if (!selectedClass || !data || loadError) { setError('A turma não está disponível neste link. Confira as turmas antes de enviar.'); return }
    setSending(true); setError('')
    try {
      const { data: response } = await publicApi.post(`/enrollment/${slug}/apply`, { ...form, curso_id: courseId || undefined, aluno_cpf: form.aluno_cpf.replace(/\D/g, '') || undefined, aluno_telefone: form.aluno_telefone.trim() || undefined, aluno_email: form.aluno_email.trim() || undefined, parentesco: form.solicitante_tipo === 'RESPONSAVEL' ? form.parentesco : undefined })
      setResult(response)
    } catch (caught) { setError(messageFrom(caught)) } finally { setSending(false) }
  }

  return <div className="course-invite" style={{ '--invite-accent': visual.color, '--invite-deep': visual.deep, '--invite-pale': visual.pale } as CSSProperties}>
    <Head><title>{`${data?.course?.nome ? `Inscrição em ${data.course.nome}` : 'Inscrição de aluno'} | ${data?.organization ?? 'Amparo GOV'}`}</title><meta key="description" name="description" content={description.slice(0, 250)} /><meta name="theme-color" content={visual.deep} key="app-theme" /><meta property="og:type" content="website" /><meta property="og:locale" content="pt_BR" /><meta property="og:title" content={`${title} | ${data?.organization ?? 'Amparo GOV'}`} /><meta property="og:description" content={description.slice(0, 250)} /><meta property="og:image" content={`${shareOrigin}${visual.src}`} /><meta property="og:image:alt" content={visual.alt} /><meta property="og:url" content={canonical} /><meta name="twitter:card" content="summary_large_image" />{shareOrigin && <link rel="canonical" href={canonical} />}</Head>
    <header className="invite-topbar"><div><Image src="/amparo/logo-principal.png" alt="Amparo GOV" width={2180} height={721} priority className="invite-logo" /><span className="invite-top-divider" /><span className="invite-organization">{data?.organization ?? 'Inscrição on-line'}</span></div><span className="invite-online"><span />Inscrição on-line</span></header>
    <main className="invite-container">
      <section className="invite-hero"><div className="invite-hero-copy"><span className="invite-eyebrow">{data?.course?.tipo === 'CURSO' ? 'CONVITE PARA APRENDER' : 'CONVITE PARA PARTICIPAR'}</span><h1>{title}</h1><h2>{visual.headline}</h2><p>{visual.detail}</p><a href="#invite-form" className="invite-btn invite-btn-light" onClick={() => setStarted(true)}>{result ? 'Ver confirmação' : 'Quero participar'}<ArrowRight size={18} /></a><span className="invite-hero-note">{data?.organization ? `Uma iniciativa de ${data.organization}` : 'Aprendizado e participação em cada etapa.'}</span></div><figure className="invite-cover"><Image src={visual.src} alt={visual.alt} fill priority sizes="(max-width: 700px) 100vw, 580px" quality={82} /><figcaption>Imagem ilustrativa</figcaption></figure></section>
      <div className="invite-facts"><div><School size={19} /><span><strong>{data ? availableClasses?.length ?? 0 : '—'}</strong> {availableClasses?.length === 1 ? 'turma disponível' : 'turmas disponíveis'}</span></div><div><Users size={19} /><span>{!data ? 'Buscando vagas' : unavailable ? 'Aguarde novas turmas' : vacancies ? <><strong>{vacancies}</strong> {vacancies === 1 ? 'vaga disponível' : 'vagas disponíveis'}</> : 'Lista de reserva disponível'}</span></div><div><ClipboardCheck size={19} /><span>Confirmação ao concluir o envio</span></div></div>
      <div className="invite-content"><aside className="invite-guide"><span className="invite-eyebrow">SEU PRÓXIMO PASSO</span><h2>Vamos começar?</h2><p>Preencha os dados e escolha sua turma. A instituição recebe sua inscrição diretamente no sistema.</p><ol><li><span>01</span><div><strong>Conte quem está preenchendo</strong><p>Aluno, responsável ou professor.</p></div></li><li><span>02</span><div><strong>Confira os dados do aluno</strong><p>Tenha o nome completo, nascimento e um contato em mãos.</p></div></li><li><span>03</span><div><strong>Escolha e confirme</strong><p>Se as vagas acabarem, a inscrição entra na reserva.</p></div></li></ol>{data?.course?.descricao && <div className="invite-about"><h3>Sobre {data.course.nome}</h3><p>{data.course.descricao}</p></div>}<div className="invite-support"><HeartHandshake size={23} /><div><strong>Precisa de ajuda?</strong><p>Fale com a instituição que compartilhou este convite.</p></div></div></aside>
      <section className="invite-form-card" id="invite-form" aria-label="Formulário de inscrição">
        {result ? <div className="invite-success" role="status"><span className="invite-success-icon"><CheckCircle2 size={40} /></span><p className="invite-eyebrow">PRÓXIMO PASSO CONCLUÍDO</p><h2 ref={heading} tabIndex={-1}>Inscrição recebida!</h2><p><strong>{form.aluno_nome}</strong>, sua inscrição em {data?.course?.nome ?? 'uma nova atividade'} chegou à instituição.</p><div className={`invite-result ${result.status === 'EM_ESPERA' ? 'is-waiting' : ''}`}><strong>{result.status === 'ATIVA' ? 'Matrícula confirmada' : 'Você está na lista de reserva'}</strong><p>Turma: {result.turma}</p>{result.status === 'ATIVA' ? <p>A matrícula foi confirmada dentro das vagas disponíveis.</p> : <p>A turma está completa. O aluno entrou na lista de espera{result.posicao_espera ? ` na posição ${result.posicao_espera}` : ''}.</p>}</div><p className="invite-small">Guarde esta confirmação. Para acompanhar sua inscrição, fale com {data?.organization ?? 'a instituição'}.</p></div> : <>
          <div className="invite-form-heading"><span className="invite-eyebrow">FAÇA PARTE</span><h2>{formTitle}</h2><p>{preferredRole === 'PROFESSOR' ? 'Professor: preencha a inscrição do aluno nesta atividade.' : preferredRole === 'RESPONSAVEL' ? 'Responsável: preencha seus dados e os dados do aluno.' : 'Sua inscrição, um passo de cada vez.'}</p></div>
          {loadError ? <div className="invite-state"><p role="alert">Não foi possível carregar as turmas. O link pode estar indisponível ou as inscrições encerradas. Fale com a organização.</p><button type="button" className="invite-btn invite-btn-outline" onClick={() => void mutate()}>Tentar novamente</button></div> : !data ? <p role="status" className="invite-state">Preparando seu convite...</p> : unavailable ? <div className="invite-state"><School size={32} /><h3>{classId ? 'Esta turma não está disponível neste link' : 'Novas turmas em breve'}</h3><p>{classId ? 'Peça à instituição um novo convite para a turma desejada.' : 'Ainda não há turmas abertas para inscrição. Fale com a organização.'}</p></div> : <>
          <ol className="invite-steps" aria-label="Etapas da inscrição">{steps.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={index < step ? 'is-complete' : index === step ? 'is-current' : ''}><span>{index < step ? <Check size={14} /> : index + 1}</span><small>{label}</small></li>)}</ol>
          <form onSubmit={submit} noValidate><div className="invite-step-heading"><span>ETAPA {step + 1} DE 4</span><h3 ref={heading} tabIndex={-1}>{step === 0 ? 'Quem está preenchendo?' : step === 1 ? 'Dados do aluno' : step === 2 ? 'Escolha sua turma' : 'Revise e confirme'}</h3><p>{step === 0 ? 'Selecione uma opção e informe seu contato.' : step === 1 ? 'Use o nome como aparece nos documentos.' : step === 2 ? 'Turmas lotadas recebem novas inscrições na reserva.' : 'Confira as informações antes de enviar à instituição.'}</p></div>
          {error && <p role="alert" className="invite-error">{error}</p>}
          {step === 0 && <div className="invite-fields"><div className="invite-roles">{([{ value: 'RESPONSAVEL', label: 'Responsável', detail: 'Mãe, pai ou responsável', icon: HeartHandshake }, { value: 'ALUNO', label: 'Sou o aluno', detail: 'Minha própria inscrição', icon: GraduationCap }, { value: 'PROFESSOR', label: 'Professor', detail: 'Inscrever um aluno', icon: School }] as const).map(({ value, label, detail, icon: Icon }) => <button key={value} type="button" aria-pressed={form.solicitante_tipo === value} onClick={() => update('solicitante_tipo', value)}><Icon size={23} /><strong>{label}</strong><small>{detail}</small>{form.solicitante_tipo === value && <CheckCircle2 className="invite-role-check" size={15} />}</button>)}</div><label className="invite-field"><span>Seu nome completo *</span><input value={form.solicitante_nome} onChange={event => update('solicitante_nome', event.target.value)} autoComplete="name" aria-required maxLength={200} placeholder="Como podemos chamar você?" /></label><label className="invite-field"><span>Telefone ou e-mail para contato *</span><input value={form.solicitante_contato} onChange={event => update('solicitante_contato', event.target.value)} aria-required maxLength={120} placeholder="Telefone com DDD ou e-mail" /></label>{form.solicitante_tipo === 'RESPONSAVEL' && <label className="invite-field"><span>Parentesco com o aluno *</span><select value={form.parentesco} onChange={event => update('parentesco', event.target.value)} aria-required><option value="">Selecione</option>{[['MAE','Mãe'],['PAI','Pai'],['AVO','Avô ou avó'],['TIO','Tio ou tia'],['TUTOR_LEGAL','Tutor legal'],['OUTRO','Outro']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>}</div>}
          {step === 1 && <div className="invite-fields"><label className="invite-field"><span>Nome completo do aluno *</span><input value={form.aluno_nome} onChange={event => update('aluno_nome', event.target.value)} autoComplete="off" aria-required maxLength={200} placeholder="Nome como aparece nos documentos" /></label><div className="invite-field-grid"><label className="invite-field"><span>Data de nascimento *</span><input type="date" max={new Date().toISOString().slice(0, 10)} value={form.aluno_nascimento} onChange={event => update('aluno_nascimento', event.target.value)} aria-required /></label><label className="invite-field"><span>CPF, se tiver</span><input inputMode="numeric" value={form.aluno_cpf} onChange={event => update('aluno_cpf', event.target.value)} placeholder="Somente números" maxLength={14} /></label><label className="invite-field"><span>Telefone do aluno, se tiver</span><input type="tel" value={form.aluno_telefone} onChange={event => update('aluno_telefone', event.target.value)} maxLength={30} placeholder="Telefone com DDD" /></label><label className="invite-field"><span>E-mail do aluno, se tiver</span><input type="email" value={form.aluno_email} onChange={event => update('aluno_email', event.target.value)} placeholder="nome@exemplo.com" /></label></div></div>}
          {step === 2 && <div className="invite-class-options">{availableClasses?.map(item => <button type="button" key={item.id} aria-pressed={form.turma_id === item.id} onClick={() => update('turma_id', item.id)}><span className="invite-class-radio">{form.turma_id === item.id && <span />}</span><span><strong>{item.nome}</strong>{!data.course && item.curso?.nome && <small>{item.curso.nome}</small>}{item.project?.name && <small>{item.project.name}</small>}<span className={`invite-class-status${!item.vagas ? ' is-waiting' : ''}`}>{item.vagas ? `${item.vagas} vaga${item.vagas === 1 ? '' : 's'} disponíve${item.vagas === 1 ? 'l' : 'is'}` : 'Lista de reserva'}</span></span><ChevronRight size={17} /></button>)}</div>}
          {step === 3 && <div className="invite-fields"><dl className="invite-review"><div><dt>Atividade</dt><dd>{data.course?.nome ?? selectedClass?.curso?.nome ?? 'Inscrição de aluno'}</dd></div><div><dt>Aluno</dt><dd>{form.aluno_nome}</dd></div><div><dt>Turma</dt><dd>{selectedClass?.nome}</dd></div><div><dt>Quem preenche</dt><dd>{form.solicitante_nome}</dd></div><div><dt>Situação prevista</dt><dd>{selectedClass?.vagas ? 'Vaga disponível' : 'Lista de reserva'}</dd></div></dl><p className="invite-small">A situação final será definida no momento do envio, conforme as vagas disponíveis.</p><label className="invite-consent"><input type="checkbox" checked={form.consentimento} onChange={event => update('consentimento', event.target.checked)} /><span>Confirmo que os dados estão corretos e que tenho autorização para enviá-los à organização para a inscrição e acompanhamento do aluno. *</span></label></div>}
          <div className="invite-actions"><button type="button" className="invite-back" disabled={step === 0 || sending} onClick={() => { setStarted(true); setStep(current => current - 1); setError('') }}><ArrowLeft size={16} />Voltar</button><button type="submit" disabled={sending} className="invite-btn invite-btn-primary">{sending ? 'Enviando...' : step < 3 ? 'Continuar' : 'Enviar inscrição'}{!sending && <ArrowRight size={17} />}</button></div><p className="invite-form-footer"><LockKeyhole size={13} />Seus dados são enviados à instituição responsável pela atividade.</p></form>
          </>}
        </>}
      </section></div>
      <footer className="invite-footer"><Image src="/amparo/icone-app.png" alt="" width={24} height={24} /><span>Inscrições organizadas com Amparo GOV</span><span>{data?.organization}</span></footer>
    </main>
  </div>
}
