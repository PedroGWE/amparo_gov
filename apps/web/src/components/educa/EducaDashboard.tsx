import Image from 'next/image'
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  Plus,
  Users,
  Video,
} from 'lucide-react'
import type { ClassItem, Overview } from './types'
import type { EducaSection } from './EducaLayout'
import { Badge, EmptyState, Loading, Panel } from './EducaUI'
import { safeMeetUrl, shortDate, time } from './educa-utils'

export function EducaDashboard({
  overview,
  classes,
  teacher,
  manager,
  name,
  openClass,
  navigate,
  loading,
  search,
}: {
  overview?: Overview
  classes?: ClassItem[]
  teacher: boolean
  manager: boolean
  name: string
  openClass: (id: string, section?: EducaSection, activityId?: string) => void
  navigate: (section: EducaSection) => void
  loading: boolean
  search: string
}) {
  const next = overview?.proximas_aulas[0]
  const stats = overview?.resumo
  const firstName = name.split(' ')[0]
  const activities = overview?.atividades.filter((item) => item.pendentes > 0) ?? []
  const searchMatch = (value: string) =>
    value.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))
  return (
    <>
      <div className="edu-page-heading">
        <div>
          <p className="edu-eyebrow">BOM TER VOCÊ POR AQUI</p>
          <h1>
            Olá, {firstName}!{' '}
            <span className="edu-hello" aria-hidden="true">
              ☀
            </span>
          </h1>
          <p>
            {manager
              ? 'Acompanhe o aprendizado e cuide de cada etapa.'
              : teacher
                ? 'Tudo pronto para uma nova aula?'
                : 'Seu próximo aprendizado começa aqui.'}
          </p>
        </div>
        <span className="edu-today">
          <CalendarDays size={17} />
          {new Date().toLocaleDateString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: 'numeric',
            month: 'long',
          })}
        </span>
      </div>
      {loading && <Loading text="Preparando seu espaço..." />}
      <div className="edu-dashboard-grid">
        <div className="edu-dashboard-primary">
          <div className="edu-stats-grid">
            <button className="edu-stat" type="button" onClick={() => navigate('turmas')}>
              <span className="edu-stat-icon edu-tone-green">
                <Users />
              </span>
              <span>
                <strong>{stats?.turmas ?? classes?.length ?? '—'}</strong>
                <small>{teacher ? 'turmas' : 'minhas turmas'}</small>
              </span>
            </button>
            <button
              className="edu-stat"
              type="button"
              onClick={() => navigate(teacher ? 'turmas' : 'materiais')}
            >
              <span className="edu-stat-icon edu-tone-blue">
                {teacher ? <GraduationCap /> : <BookOpen />}
              </span>
              <span>
                <strong>{teacher ? (stats?.alunos ?? '—') : (stats?.materiais ?? '—')}</strong>
                <small>{teacher ? 'alunos vinculados' : 'materiais para explorar'}</small>
              </span>
            </button>
            <button className="edu-stat" type="button" onClick={() => navigate('atividades')}>
              <span className="edu-stat-icon edu-tone-yellow">
                <ClipboardCheck />
              </span>
              <span>
                <strong>{stats?.pendentes ?? '—'}</strong>
                <small>{teacher ? 'entregas para corrigir' : 'atividades para fazer'}</small>
              </span>
            </button>
          </div>
          <section className="edu-next-lesson">
            <div className="edu-next-content">
              <span className="edu-eyebrow">
                {next ? 'SEU PRÓXIMO ENCONTRO' : 'SEU PRÓXIMO PASSO'}
              </span>
              <h2>
                {next?.titulo ??
                  (teacher
                    ? 'Uma boa aula começa com uma ideia.'
                    : 'Um mundo de descobertas espera por você.')}
              </h2>
              <p>
                {next
                  ? next.turma.nome
                  : teacher
                    ? 'Organize os encontros e inspire novos aprendizados.'
                    : 'Explore suas turmas, descubra os materiais e avance no seu ritmo.'}
              </p>
              {next && (
                <p className="edu-next-time">
                  <CalendarDays size={16} />
                  {shortDate(next.inicio)}, {time(next.inicio)} às {time(next.fim)}
                </p>
              )}
              {next && safeMeetUrl(next.meet_url) ? (
                <a
                  className="edu-btn edu-btn-primary"
                  href={safeMeetUrl(next.meet_url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Video size={17} />
                  Entrar na aula
                  <ArrowRight size={17} />
                </a>
              ) : (
                <button
                  type="button"
                  className="edu-btn edu-btn-primary"
                  onClick={() => navigate(teacher ? 'planejamento' : 'turmas')}
                >
                  {teacher ? 'Planejar minha aula' : 'Explorar minhas turmas'}
                  <ArrowRight size={17} />
                </button>
              )}
            </div>
            <Image
              unoptimized
              className="edu-learning-art"
              src="/brand/educa/learning-illustration.svg"
              alt=""
              width={420}
              height={300}
            />
          </section>
          <Panel
            title={manager ? 'Turmas da instituição' : 'Minhas turmas'}
            action={
              <button type="button" className="edu-text-button" onClick={() => navigate('turmas')}>
                Ver todas
                <ArrowRight size={14} />
              </button>
            }
            className="edu-panel-clean"
          >
            <div className="edu-class-previews">
              {classes
                ?.filter((item) => searchMatch(item.nome))
                .slice(0, 3)
                .map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`edu-class-preview edu-preview-${index % 3}`}
                    onClick={() => openClass(item.id)}
                  >
                    <span className="edu-preview-icon">
                      <BookOpen size={23} />
                    </span>
                    <h3>{item.nome}</h3>
                    <p>
                      {teacher
                        ? `${item._count.matriculas} matrículas`
                        : `${item._count.aulas} aulas`}
                    </p>
                    <span className="edu-preview-link">
                      Abrir turma
                      <ArrowRight size={16} />
                    </span>
                  </button>
                ))}
            </div>
            {classes?.length === 0 && (
              <EmptyState
                title="Seu espaço está pronto"
                text="As turmas aparecerão aqui assim que seu vínculo for confirmado pela instituição."
              />
            )}
          </Panel>
          {overview?.frequencia && (
            <section className="edu-progress-card">
              <div className="edu-tone-green edu-stat-icon">
                <CheckCircle2 />
              </div>
              <div>
                <h2>Seu caminho de aprendizagem</h2>
                <p>
                  {overview.frequencia.total
                    ? `${overview.frequencia.presentes} presenças em ${overview.frequencia.total} aulas com chamada enviada.`
                    : 'Sua frequência aparecerá quando o professor enviar a primeira chamada.'}
                </p>
              </div>
              <button
                type="button"
                className="edu-text-button"
                onClick={() => navigate('frequencia')}
              >
                Ver frequência
                <ArrowRight size={16} />
              </button>
            </section>
          )}
        </div>
        <aside className="edu-dashboard-secondary">
          <Panel
            title="Na sua agenda"
            action={
              <button type="button" className="edu-text-button" onClick={() => navigate('aulas')}>
                Ver aulas
                <ArrowRight size={14} />
              </button>
            }
          >
            <div className="edu-agenda-list">
              {overview?.proximas_aulas.slice(0, 4).map((lesson, index) => (
                <button
                  type="button"
                  key={lesson.id}
                  className="edu-agenda-item"
                  onClick={() => openClass(lesson.turma.id, 'aulas')}
                >
                  <span className={index === 0 ? 'edu-agenda-dot is-first' : 'edu-agenda-dot'} />
                  <span className="edu-agenda-time">
                    {time(lesson.inicio)}
                    <small>{shortDate(lesson.inicio)}</small>
                  </span>
                  <span>
                    <strong>{lesson.titulo}</strong>
                    <small>{lesson.turma.nome}</small>
                  </span>
                </button>
              ))}
            </div>
            {overview && !overview.proximas_aulas.length && (
              <p className="edu-mini-empty">
                <CalendarDays size={20} />
                Nenhuma aula agendada por enquanto.
              </p>
            )}
          </Panel>
          <Panel
            title={teacher ? 'Correções pendentes' : 'Vamos colocar em dia?'}
            action={
              <button
                type="button"
                className="edu-text-button"
                onClick={() => navigate('atividades')}
              >
                Ver todas
              </button>
            }
          >
            <div className="edu-pending-list">
              {activities.slice(0, 3).map((activity) => (
                <button
                  type="button"
                  className="edu-pending-item"
                  key={activity.id}
                  onClick={() => openClass(activity.turma.id, 'atividades', activity.id)}
                >
                  <span className={`edu-pending-icon edu-tone-${teacher ? 'red' : 'yellow'}`}>
                    <ClipboardCheck size={20} />
                  </span>
                  <span>
                    <strong>{activity.titulo}</strong>
                    <small>
                      {activity.turma.nome}
                      {teacher
                        ? ` · ${activity.pendentes} entrega(s)`
                        : activity.prazo
                          ? ` · ${shortDate(activity.prazo)}`
                          : ''}
                    </small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
            {overview && !activities.length && (
              <div className="edu-all-clear">
                <CheckCircle2 size={24} />
                <strong>Tudo em dia por aqui!</strong>
                <p>
                  {teacher
                    ? 'Nenhuma entrega aguardando avaliação.'
                    : 'Nenhuma atividade pendente no momento.'}
                </p>
              </div>
            )}
          </Panel>
          <section className="edu-tip-card">
            <span className="edu-tip-icon">{teacher ? <Plus /> : <BookOpen />}</span>
            <h2>{teacher ? 'Planeje sua próxima aula' : 'Pequenos passos, grandes descobertas'}</h2>
            <p>
              {teacher
                ? 'Compartilhe uma ideia, proponha uma atividade e acompanhe cada descoberta.'
                : 'Reserve um tempinho para revisar os materiais. Cada descoberta faz parte da sua jornada.'}
            </p>
            <button
              type="button"
              className="edu-btn edu-btn-white"
              onClick={() => navigate(teacher ? 'planejamento' : 'materiais')}
            >
              {teacher ? 'Abrir planejamento' : 'Ir para a biblioteca'}
              <ArrowRight size={16} />
            </button>
          </section>
          {teacher && !!stats?.chamadas_pendentes && (
            <button type="button" className="edu-reminder" onClick={() => navigate('chamada')}>
              <Clock3 size={18} />
              <span>{stats.chamadas_pendentes} chamada(s) aguardando envio</span>
              <Badge tone="yellow">Revisar</Badge>
            </button>
          )}
        </aside>
      </div>
    </>
  )
}
