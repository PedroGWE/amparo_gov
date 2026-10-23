import { type CSSProperties, useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import useSWR from 'swr'
import { useRouter } from 'next/router'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  FilePlus2,
  FileText,
  GraduationCap,
  Plus,
  Users,
  Video,
} from 'lucide-react'
import api from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/Modal'
import { EducaLayout, type EducaSection } from './EducaLayout'
import { EducaDashboard } from './EducaDashboard'
import { EducaComposer, type ComposerKind } from './EducaComposer'
import { EducaActivities } from './EducaActivities'
import { EducaAttendance } from './EducaAttendance'
import { EducaManagement } from './EducaManagement'
import { Badge, EmptyState, Loading, Panel } from './EducaUI'
import { dateTime, errorText, initials, safeMeetUrl, shortDate, time } from './educa-utils'
import type { ClassItem, Detail, Overview } from './types'
import { EducaWorkContext } from './useUnsavedWork'

const fetcher = (url: string) => api.get(url).then((response) => response.data)
const titles: Record<EducaSection, string> = {
  inicio: 'Visão geral',
  turmas: 'Minhas turmas',
  planejamento: 'Planejamento',
  aulas: 'Aulas',
  atividades: 'Atividades',
  materiais: 'Biblioteca',
  chamada: 'Chamada',
  frequencia: 'Minha frequência',
  perfil: 'Meu perfil',
  acessos: 'Acessos',
  relatorios: 'Chamadas recebidas',
  alunos: 'Alunos da turma',
}

export default function EducaPortal({ manager = false }: { manager?: boolean }) {
  const router = useRouter()
  const tenant = typeof router.query.tenant === 'string' ? router.query.tenant : ''
  const { logout, user } = useAuth()
  const teacher = manager || router.pathname.includes('/professor')
  const allowed: EducaSection[] = [
    'inicio',
    'turmas',
    'aulas',
    'atividades',
    'materiais',
    'perfil',
    ...(teacher
      ? (['planejamento', 'chamada', 'alunos'] as EducaSection[])
      : (['frequencia'] as EducaSection[])),
    ...(manager ? (['acessos', 'relatorios'] as EducaSection[]) : []),
  ]
  const requestedSection = typeof router.query.aba === 'string' ? router.query.aba : 'inicio'
  const section = allowed.includes(requestedSection as EducaSection)
    ? (requestedSection as EducaSection)
    : 'inicio'
  const selected = typeof router.query.turma === 'string' ? router.query.turma : ''
  const [search, setSearch] = useState('')
  const [composer, setComposer] = useState<ComposerKind | null>(null)
  const [createClass, setCreateClass] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [unsaved, setUnsaved] = useState<Record<string, boolean>>({})
  const registerWork = useCallback(
    (id: string, dirty: boolean) =>
      setUnsaved((current) =>
        current[id] === dirty || (!dirty && !current[id]) ? current : { ...current, [id]: dirty },
      ),
    [],
  )
  const hasUnsaved = Object.values(unsaved).some(Boolean)
  useEffect(() => {
    if (!hasUnsaved) return
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [hasUnsaved])
  const classes = useSWR<ClassItem[]>(tenant ? `/educa/turmas?org=${tenant}` : null, fetcher)
  const overview = useSWR<Overview>(tenant ? `/educa/resumo?org=${tenant}` : null, fetcher, {
    refreshInterval: 60000,
  })
  const hasClass = classes.data?.some((item) => item.id === selected)
  const detail = useSWR<Detail>(selected && hasClass ? `/educa/turmas/${selected}` : null, fetcher)
  const d = detail.data
  const name = overview.data?.perfil?.nome ?? user?.name ?? (teacher ? 'professor' : 'aluno')
  const institute = overview.data?.perfil?.instituto ?? tenant
  const classSections: EducaSection[] = [
    'planejamento',
    'aulas',
    'atividades',
    'materiais',
    'chamada',
    'frequencia',
    'alunos',
  ]
  const needsClass = classSections.includes(section)
  const className = classes.data?.find((item) => item.id === selected)?.nome
  const searchMatches = (value: string) =>
    value.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))
  const lessonId = typeof router.query.aula === 'string' ? router.query.aula : ''
  const attendanceLesson =
    d?.aulas.find((item) => item.id === lessonId) ??
    d?.aulas.find((item) => !item.chamada_enviada_at) ??
    d?.aulas[0]
  useEffect(() => {
    if (section === 'chamada' && attendanceLesson && !lessonId) {
      void router.replace(
        { pathname: router.pathname, query: { ...router.query, aula: attendanceLesson.id } },
        undefined,
        { shallow: true },
      )
    }
  }, [section, attendanceLesson, lessonId, router])

  async function refresh() {
    await Promise.all([classes.mutate(), detail.mutate(), overview.mutate()])
  }
  function navigate(next: EducaSection, classId?: string, extra?: Record<string, string>) {
    if (
      hasUnsaved &&
      !window.confirm('Você tem alterações não salvas. Deseja sair desta tela e descartá-las?')
    )
      return
    setSearch('')
    setError('')
    setMessage('')
    setComposer(null)
    const nextClass = classId ?? (classSections.includes(next) ? selected : '')
    void router.push(
      {
        pathname: router.pathname,
        query: { tenant, aba: next, ...(nextClass ? { turma: nextClass } : {}), ...extra },
      },
      undefined,
      { shallow: true },
    )
  }
  function openClass(id: string, next: EducaSection = 'aulas', activityId?: string) {
    navigate(next, id, activityId ? { atividade: activityId } : undefined)
  }
  useEffect(() => {
    setComposer(null)
  }, [selected])
  async function download(id: string) {
    setDownloading(true)
    setError('')
    try {
      const response = await api.get(`/educa/arquivos/${id}`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const element = document.createElement('a')
      const encoded = String(response.headers['content-disposition'] ?? '').match(
        /filename\*=UTF-8''(.+)/,
      )?.[1]
      element.href = url
      element.download = encoded ? decodeURIComponent(encoded) : 'material-educa'
      element.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('Arquivo baixado. Bons estudos!')
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setDownloading(false)
    }
  }
  const loadedError = classes.error || overview.error || detail.error
  const day = (value: string) =>
    new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' })
  const month = (value: string) =>
    new Date(value)
      .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'short' })
      .replace('.', '')
  const lessons =
    d?.aulas
      .filter((lesson) => searchMatches(lesson.titulo))
      .slice()
      .sort((a, b) => {
        const aPast = new Date(a.fim).getTime() < Date.now()
        const bPast = new Date(b.fim).getTime() < Date.now()
        return aPast !== bPast
          ? Number(aPast) - Number(bPast)
          : aPast
            ? new Date(b.inicio).getTime() - new Date(a.inicio).getTime()
            : new Date(a.inicio).getTime() - new Date(b.inicio).getTime()
      }) ?? []
  return (
    <EducaWorkContext.Provider value={registerWork}>
      <EducaLayout
        teacher={teacher}
        manager={manager}
        section={section}
        navigate={navigate}
        userName={name}
        institute={institute}
        tenant={tenant}
        search={search}
        setSearch={setSearch}
        logout={async () => {
          if (!hasUnsaved || window.confirm('Há alterações não salvas. Deseja sair do portal?'))
            await logout()
        }}
      >
        <Head>
          <title>{`${titles[section]} | ${teacher ? 'Portal do professor' : 'Portal do aluno'} | Educa Amparo GOV`}</title>
        </Head>
        {error && (
          <p role="alert" className="edu-alert edu-alert-error">
            {error}
            <button type="button" onClick={() => setError('')}>
              Fechar
            </button>
          </p>
        )}
        {message && (
          <p role="status" className="edu-alert edu-alert-success">
            {message}
            <button type="button" onClick={() => setMessage('')}>
              Fechar
            </button>
          </p>
        )}
        {loadedError && (
          <p role="alert" className="edu-alert edu-alert-error">
            Não foi possível carregar os dados. Verifique seu acesso ou sua conexão.
            <button type="button" className="edu-text-button" onClick={() => void refresh()}>
              Tentar novamente
            </button>
          </p>
        )}
        {section === 'inicio' && (
          <EducaDashboard
            overview={overview.data}
            classes={classes.data}
            teacher={teacher}
            manager={manager}
            name={name}
            openClass={openClass}
            navigate={navigate}
            loading={!overview.data && !overview.error}
            search={search}
          />
        )}
        {section !== 'inicio' && (
          <>
            {needsClass && selected && (
              <button type="button" className="edu-back-link" onClick={() => navigate('turmas')}>
                <ArrowLeft size={14} />
                Todas as turmas
                <ChevronRight size={12} />
                {className ?? 'Turma'}
              </button>
            )}
            <div className="edu-page-heading">
              <div>
                <p className="edu-eyebrow">
                  {manager
                    ? 'GESTÃO EDUCACIONAL'
                    : teacher
                      ? 'SEU ESPAÇO PARA ENSINAR'
                      : 'SEU ESPAÇO PARA APRENDER'}
                </p>
                <h1>
                  {section === 'turmas' && manager ? 'Turmas da instituição' : titles[section]}
                </h1>
                <p>
                  {section === 'atividades'
                    ? teacher
                      ? 'Organize propostas e acompanhe cada entrega.'
                      : 'Aprenda, faça suas descobertas e compartilhe com o professor.'
                    : section === 'chamada'
                      ? 'Registre a presença e acompanhe a frequência da turma.'
                      : section === 'materiais'
                        ? 'Um lugar para guardar e compartilhar conhecimento.'
                        : section === 'planejamento'
                          ? 'Prepare os próximos encontros e dê espaço às descobertas.'
                          : section === 'aulas'
                            ? 'Seu encontro com o aprendizado.'
                            : section === 'frequencia'
                              ? 'Cada encontro faz parte da sua jornada.'
                              : section === 'turmas'
                                ? 'Escolha uma turma e vamos começar.'
                                : section === 'perfil'
                                  ? 'Seu acesso, sua instituição e seu espaço.'
                                  : 'Cuide dos acessos e acompanhe sua instituição.'}
                </p>
              </div>
              <div className="edu-button-row">
                {manager && section === 'turmas' && (
                  <button
                    type="button"
                    className="edu-btn edu-btn-primary"
                    onClick={() => setCreateClass(true)}
                  >
                    <Plus size={17} />
                    Criar turma
                  </button>
                )}
                {d?.canTeach &&
                  hasClass &&
                  ['aulas', 'planejamento', 'materiais', 'atividades'].includes(section) && (
                    <button
                      type="button"
                      className="edu-btn edu-btn-primary"
                      onClick={() =>
                        setComposer(
                          section === 'materiais'
                            ? 'material'
                            : section === 'atividades'
                              ? 'atividade'
                              : 'aula',
                        )
                      }
                    >
                      <Plus size={17} />
                      {section === 'materiais'
                        ? 'Novo material'
                        : section === 'atividades'
                          ? 'Nova atividade'
                          : 'Agendar aula'}
                    </button>
                  )}
              </div>
            </div>
            {needsClass && (
              <div className="edu-class-picker">
                <label className="edu-field">
                  <span>Turma</span>
                  <select
                    className="input"
                    value={hasClass ? selected : ''}
                    onChange={(event) => navigate(section, event.target.value)}
                  >
                    <option value="">Selecione uma turma</option>
                    {classes.data?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {classes.data && selected && needsClass && !hasClass && (
              <p role="alert" className="edu-alert edu-alert-error">
                Esta turma não está disponível no seu acesso. Escolha uma das suas turmas.
              </p>
            )}
            {(section === 'turmas' || (needsClass && !selected)) && (
              <>
                {!classes.data && !classes.error && <Loading text="Buscando suas turmas..." />}
                <div className="edu-class-grid">
                  {classes.data
                    ?.filter((item) => searchMatches(item.nome))
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="edu-class-card"
                        onClick={() => openClass(item.id, section === 'turmas' ? 'aulas' : section)}
                      >
                        <div className="edu-class-card-cover">
                          <span>
                            <BookOpen size={27} />
                          </span>
                          <Badge tone="green">Minha turma</Badge>
                        </div>
                        <div className="edu-class-card-body">
                          <h2>{item.nome}</h2>
                          <div className="edu-class-card-meta">
                            <span>
                              <CalendarDays size={14} />
                              {item._count.aulas} aulas
                            </span>
                            {teacher && (
                              <span>
                                <Users size={14} />
                                {item._count.matriculas} matrículas
                              </span>
                            )}
                          </div>
                          <span className="edu-preview-link">
                            {needsClass
                              ? `Abrir ${titles[section].toLocaleLowerCase('pt-BR')}`
                              : 'Abrir turma'}
                            <ArrowRight size={16} />
                          </span>
                        </div>
                      </button>
                    ))}
                </div>
                {classes.data?.length === 0 && (
                  <EmptyState
                    title="As turmas vão aparecer aqui"
                    text="Procure o gestor da instituição para confirmar seu vínculo e começar a usar o portal."
                  />
                )}
                {!!classes.data?.length &&
                  !classes.data.some((item) => searchMatches(item.nome)) && (
                    <EmptyState
                      title="Nenhuma turma encontrada"
                      text="Tente buscar por outro nome."
                    />
                  )}
              </>
            )}
            {needsClass && selected && hasClass && !d && !detail.error && (
              <Loading text="Organizando o conteúdo da turma..." />
            )}
            {d && hasClass && needsClass && (
              <>
                <div className="edu-context-line">
                  <span />
                  <strong>{d.turma.nome}</strong>
                  <span>·</span>
                  <span>{d.aulas.length} aulas</span>
                  <span>·</span>
                  <span>{d.materiais.length} materiais</span>
                  {d.canTeach && (
                    <button
                      type="button"
                      className="edu-text-button"
                      onClick={() => navigate('alunos')}
                    >
                      Ver alunos
                      <ArrowRight size={12} />
                    </button>
                  )}
                </div>
                {(section === 'aulas' || section === 'planejamento') && (
                  <div className="edu-lesson-list">
                    {!lessons.length && (
                      <EmptyState
                        title={
                          search
                            ? 'Nenhuma aula corresponde à busca'
                            : 'Próximas descobertas em breve'
                        }
                        text={
                          d.canTeach
                            ? 'Agende um encontro para começar a construir essa jornada.'
                            : 'Seu professor publicará os próximos encontros por aqui.'
                        }
                      />
                    )}
                    {lessons.map((lesson) => {
                      const past = new Date(lesson.fim) < new Date()
                      const live = !past && new Date(lesson.inicio) <= new Date()
                      return (
                        <section key={lesson.id} className="edu-panel">
                          <div className="edu-lesson-top">
                            <span className="edu-date-tile">
                              <small>{month(lesson.inicio)}</small>
                              <strong>{day(lesson.inicio)}</strong>
                            </span>
                            <div className="edu-lesson-info">
                              <h3>{lesson.titulo}</h3>
                              <p>
                                <CalendarDays size={13} />
                                {dateTime(lesson.inicio)} às {time(lesson.fim)}
                              </p>
                              <Badge tone={live ? 'green' : past ? 'neutral' : 'blue'}>
                                {live ? 'No horário da aula' : past ? 'Aula anterior' : 'Agendada'}
                              </Badge>
                            </div>
                          </div>
                          <div className="edu-lesson-actions">
                            {safeMeetUrl(lesson.meet_url) && (
                              <a
                                href={safeMeetUrl(lesson.meet_url)}
                                target="_blank"
                                rel="noreferrer"
                                className={`edu-btn ${past ? 'edu-btn-outline' : 'edu-btn-primary'}`}
                              >
                                <Video size={16} />
                                {past ? 'Abrir link da aula' : 'Entrar na aula'}
                                <ArrowRight size={15} />
                              </a>
                            )}
                            {d.canTeach ? (
                              <button
                                type="button"
                                className="edu-btn edu-btn-soft"
                                onClick={() => navigate('chamada', selected, { aula: lesson.id })}
                              >
                                <ClipboardCheck size={16} />
                                {lesson.chamada_enviada_at ? 'Ver chamada' : 'Fazer chamada'}
                              </button>
                            ) : (
                              <EducaAttendance
                                key={lesson.id}
                                lesson={lesson}
                                detail={d}
                                onSaved={refresh}
                              />
                            )}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                )}
                {section === 'materiais' && (
                  <>
                    <div className="edu-material-list">
                      {d.materiais
                        .filter((item) => searchMatches(`${item.titulo} ${item.texto}`))
                        .map((material) => (
                          <Panel key={material.id} title={material.titulo}>
                            <span className="edu-material-icon">
                              <FileText size={24} />
                            </span>
                            <p className="edu-reading">
                              {material.texto || 'Material de apoio compartilhado com a turma.'}
                            </p>
                            <div className="edu-material-footer">
                              <Badge tone="blue">Material da turma</Badge>
                              {material.anexo_id && (
                                <button
                                  type="button"
                                  className="edu-btn edu-btn-outline"
                                  disabled={downloading}
                                  onClick={() => void download(material.anexo_id!)}
                                >
                                  <Download size={15} />
                                  Baixar material
                                </button>
                              )}
                            </div>
                          </Panel>
                        ))}
                    </div>
                    {!d.materiais.some((item) => searchMatches(`${item.titulo} ${item.texto}`)) && (
                      <EmptyState
                        title="Sua biblioteca está pronta para crescer"
                        text={
                          d.canTeach
                            ? 'Compartilhe um material de apoio para a turma.'
                            : 'Os materiais publicados pelo professor aparecerão aqui.'
                        }
                      />
                    )}
                  </>
                )}
                {section === 'atividades' && (
                  <EducaActivities
                    key={selected}
                    detail={d}
                    classId={selected}
                    search={search}
                    focusedId={
                      typeof router.query.atividade === 'string'
                        ? router.query.atividade
                        : undefined
                    }
                    download={download}
                    onSaved={refresh}
                  />
                )}
                {section === 'chamada' && d.canTeach && (
                  <>
                    {d.aulas.length > 0 && (
                      <div className="edu-toolbar">
                        <label className="edu-field flex-1">
                          <span>Aula da chamada</span>
                          <select
                            className="input"
                            value={attendanceLesson?.id ?? ''}
                            onChange={(event) =>
                              navigate('chamada', selected, { aula: event.target.value })
                            }
                          >
                            {d.aulas.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.titulo} · {shortDate(item.inicio)} ·{' '}
                                {item.chamada_enviada_at ? 'Enviada' : 'Pendente'}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                    {attendanceLesson ? (
                      <Panel
                        title={attendanceLesson.titulo}
                        description={`${dateTime(attendanceLesson.inicio)} · ${d.turma.nome}`}
                      >
                        <EducaAttendance
                          key={attendanceLesson.id}
                          lesson={attendanceLesson}
                          detail={d}
                          onSaved={refresh}
                        />
                      </Panel>
                    ) : (
                      <EmptyState
                        title="A primeira chamada começa com uma aula"
                        text="Agende um encontro no Planejamento para registrar a presença dos alunos."
                        action={
                          <button
                            type="button"
                            className="edu-btn edu-btn-primary"
                            onClick={() => navigate('planejamento')}
                          >
                            Ir para o planejamento
                          </button>
                        }
                      />
                    )}
                  </>
                )}
                {section === 'frequencia' && !d.canTeach && (
                  <>
                    {(() => {
                      const sent = d.aulas.filter(
                        (item) => item.chamada_enviada_at && item.presencas.length,
                      )
                      const present = sent.filter(
                        (item) => item.presencas[0]?.status === 'PRESENTE',
                      ).length
                      const percentage = sent.length ? Math.round((present / sent.length) * 100) : 0
                      return (
                        <>
                          <div className="edu-frequency-hero">
                            <span
                              className="edu-frequency-ring"
                              style={{ '--progress': `${percentage}%` } as CSSProperties}
                            >
                              <span>{sent.length ? `${percentage}%` : '—'}</span>
                            </span>
                            <div>
                              <h2>Cada presença conta</h2>
                              <p>
                                {sent.length
                                  ? `${present} presenças em ${sent.length} aulas com frequência registrada.`
                                  : 'Seu acompanhamento começa quando o professor enviar a primeira chamada.'}
                              </p>
                            </div>
                          </div>
                          <Panel title="Seu histórico de encontros">
                            {!d.aulas.length && (
                              <EmptyState
                                title="Seu histórico começa em breve"
                                text="Os encontros da turma aparecerão aqui."
                              />
                            )}
                            {d.aulas.map((lesson) => {
                              const status = lesson.presencas[0]?.status
                              return (
                                <div key={lesson.id} className="edu-frequency-row">
                                  <div>
                                    <strong>{lesson.titulo}</strong>
                                    <small>{dateTime(lesson.inicio)}</small>
                                  </div>
                                  <Badge
                                    tone={
                                      !lesson.chamada_enviada_at
                                        ? 'neutral'
                                        : status === 'PRESENTE'
                                          ? 'green'
                                          : status === 'AUSENTE'
                                            ? 'red'
                                            : 'yellow'
                                    }
                                  >
                                    {!lesson.chamada_enviada_at
                                      ? 'Aguardando chamada'
                                      : status === 'PRESENTE'
                                        ? 'Presente'
                                        : status === 'AUSENTE'
                                          ? 'Ausente'
                                          : status === 'JUSTIFICADA'
                                            ? 'Justificada'
                                            : 'Sem registro'}
                                  </Badge>
                                </div>
                              )
                            })}
                          </Panel>
                        </>
                      )
                    })()}
                  </>
                )}
                {section === 'alunos' &&
                  (manager ? (
                    <EducaManagement view="alunos" tenant={tenant} detail={d} onSaved={refresh} />
                  ) : (
                    d.canTeach && (
                      <Panel title="Alunos da turma">
                        <div className="edu-roster">
                          {d.matriculas
                            .filter(
                              (item) => item.status === 'ATIVA' && searchMatches(item.aluno.name),
                            )
                            .map((item) => (
                              <div className="edu-roster-row" key={item.id}>
                                <span className="edu-avatar">{initials(item.aluno.name)}</span>
                                <span className="edu-roster-name">{item.aluno.name}</span>
                                <Badge tone="green">Matriculado</Badge>
                              </div>
                            ))}
                        </div>
                      </Panel>
                    )
                  ))}
              </>
            )}
            {section === 'perfil' && (
              <Panel title="Seu perfil" className="edu-profile-card">
                <div className="edu-profile-intro">
                  <span className="edu-avatar">{initials(name)}</span>
                  <div>
                    <h2>{name}</h2>
                    <p>
                      {manager ? 'Gestor educacional' : teacher ? 'Professor' : 'Aluno'} · Educa
                      Amparo GOV
                    </p>
                  </div>
                </div>
                <dl className="edu-profile-fields">
                  <div>
                    <dt>Instituição</dt>
                    <dd>{institute}</dd>
                  </div>
                  {overview.data?.perfil?.matricula && (
                    <div>
                      <dt>Matrícula de acesso</dt>
                      <dd>{overview.data.perfil.matricula}</dd>
                    </div>
                  )}
                  {overview.data?.perfil?.email && (
                    <div>
                      <dt>E-mail</dt>
                      <dd>{overview.data.perfil.email}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Turmas no portal</dt>
                    <dd>{classes.data?.length ?? '—'}</dd>
                  </div>
                </dl>
                <p className="edu-form-info">
                  Para atualizar seus dados ou sua senha, fale com o gestor da instituição. Seu
                  acesso é individual.
                </p>
              </Panel>
            )}
            {manager && (section === 'acessos' || section === 'relatorios') && (
              <EducaManagement key={section} view={section} tenant={tenant} onSaved={refresh} />
            )}
          </>
        )}
        {composer && d?.canTeach && (
          <EducaComposer
            kind={composer}
            classId={selected}
            onClose={() => setComposer(null)}
            onSaved={async () => {
              await refresh()
              setMessage(
                composer === 'aula'
                  ? 'Aula agendada. Seu próximo encontro está pronto!'
                  : composer === 'atividade'
                    ? 'Atividade publicada para a turma.'
                    : 'Material compartilhado com a turma.',
              )
            }}
          />
        )}
        <Modal
          open={createClass && manager}
          onClose={() => setCreateClass(false)}
          title="Nova turma"
        >
          <div className="edu-app" style={{ minHeight: 0, background: 'transparent' }}>
            <EducaManagement
              view="turma"
              tenant={tenant}
              onSaved={async () => {
                await refresh()
                setCreateClass(false)
                setMessage('Turma criada com sucesso.')
              }}
            />
          </div>
        </Modal>
      </EducaLayout>
    </EducaWorkContext.Provider>
  )
}
