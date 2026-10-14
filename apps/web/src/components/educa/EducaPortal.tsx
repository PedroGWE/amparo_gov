import { FormEvent, ReactNode, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { ArrowLeft, BookOpen, CalendarDays, ClipboardCheck, ClipboardList, Clock3, FolderOpen, LogOut, Users, Video } from 'lucide-react'
import api from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Catalog, ClassItem, Detail, Lesson } from './types'
const fetcher = (url: string) => api.get(url).then((r) => r.data)
const date = (s: string) =>
  new Date(s).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
function Field({
  name,
  label,
  type = 'text',
  required = true,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
}) {
  return (
    <label className="block text-sm text-slate-600">
      {label}
      <input name={name} type={type} required={required} className="input mt-1" />
    </label>
  )
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="educa-panel rounded-2xl border bg-white p-5 space-y-4">
      <h2 className="font-semibold text-lg text-slate-800">{title}</h2>
      {children}
    </section>
  )
}
function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="educa-empty-state">
      <span><BookOpen /></span>
      <div><strong>{title}</strong><p>{text}</p></div>
    </div>
  )
}
function form(e: FormEvent<HTMLFormElement>) {
  e.preventDefault()
  return new FormData(e.currentTarget)
}
export default function EducaPortal({ manager = false }: { manager?: boolean }) {
  const router = useRouter()
  const tenant = String(router.query.tenant ?? '')
  const { logout, user } = useAuth()
  const [selected, setSelected] = useState('')
  const [tab, setTab] = useState('aulas')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [role, setRole] = useState('aluno')
  const [marks, setMarks] = useState<Record<string, Record<string, string>>>({})
  const classes = useSWR<ClassItem[]>(tenant ? `/educa/turmas?org=${tenant}` : null, fetcher)
  const detail = useSWR<Detail>(selected ? `/educa/turmas/${selected}` : null, fetcher)
  const catalog = useSWR<Catalog>(manager ? `/educa/cadastros?org=${tenant}` : null, fetcher)
  const reports = useSWR<Lesson[]>(manager ? `/educa/chamadas?org=${tenant}` : null, fetcher)
  async function action(fn: () => Promise<unknown>, success = 'Salvo com sucesso.') {
    setBusy(true)
    setMessage('')
    try {
      await fn()
      await Promise.all([classes.mutate(), detail.mutate(), catalog.mutate(), reports.mutate()])
      setMessage(success)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string | string[] } } }
      setMessage(
        `Erro: ${err.response?.data?.message ?? 'Não foi possível concluir. Tente novamente.'}`,
      )
    } finally {
      setBusy(false)
    }
  }
  const post = (url: string, data: unknown = {}) => api.post(`/educa/${url}`, data)
  async function upload(file: FormDataEntryValue | null) {
    if (!(file instanceof File) || !file.size) return null
    const data = new FormData()
    data.append('file', file)
    return (await post(`turmas/${selected}/arquivos`, data)).data.id as string
  }
  async function download(id: string) {
    await action(async () => {
      const r = await api.get(`/educa/arquivos/${id}`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      const disposition = String(r.headers['content-disposition'] ?? '')
      const encodedName = disposition.match(/filename\*=UTF-8''(.+)/)?.[1]
      a.download = encodedName ? decodeURIComponent(encodedName) : 'anexo'
      a.click()
      URL.revokeObjectURL(url)
    }, 'Arquivo baixado.')
  }
  function attendance(a: Lesson, send: boolean) {
    const itens = detail
      .data!.matriculas.filter((m) => m.status === 'ATIVA')
      .flatMap((m) => {
        const status =
          marks[a.id]?.[m.id] ?? a.presencas.find((p) => p.matricula_id === m.id)?.status
        return status ? [{ matricula_id: m.id, status }] : []
      })
    return action(
      () => post(`aulas/${a.id}/${send ? 'enviar' : 'rascunho'}`, { versao: a.versao, itens }),
      send ? 'Chamada enviada ao gestor do Amparo Gov.' : 'Rascunho salvo.',
    )
  }
  const d = detail.data
  const isTeacher = !manager && router.pathname.includes('professor')
  const profileLabel = manager ? 'Gestor' : isTeacher ? 'Professor' : 'Aluno'
  const initials = (user?.name ?? profileLabel).split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const tabs = [
    { id: 'aulas', label: 'Aulas', count: d?.aulas.length ?? 0, icon: <Video size={17} /> },
    { id: 'materiais', label: 'Materiais', count: d?.materiais.length ?? 0, icon: <FolderOpen size={17} /> },
    { id: 'atividades', label: 'Atividades', count: d?.atividades.length ?? 0, icon: <ClipboardList size={17} /> },
    ...(manager ? [{ id: 'alunos', label: 'Alunos', count: d?.matriculas.length ?? 0, icon: <Users size={17} /> }] : []),
  ]
  return (
    <div className="educa-root min-h-screen bg-[#f5f7fb]">
      <header className="educa-header educa-header-inner bg-white border-b px-5 md:px-10 py-4 flex items-center justify-between">
        <Link
          href={`/${tenant}/${manager ? 'educa' : router.pathname.includes('professor') ? 'professor' : 'aluno'}`}
          className="educa-brand flex gap-3 items-center text-[#153c69]"
        >
          <Image src="/brand/educa/icone-educa.png" alt="" width={43} height={43} />
          <div>
            <strong className="text-xl">Educa</strong>
            <span className="block text-xs tracking-widest">AMPARO GOV</span>
          </div>
        </Link>
        <div className="flex items-center gap-5 text-sm">
          {manager && (
            <Link href={`/${tenant}/dashboard`} className="text-blue-800">
              Voltar à gestão
            </Link>
          )}
          <span className="educa-institute hidden md:inline">{tenant}</span>
          <span className="educa-role-pill">{profileLabel}</span>
          <span className="educa-avatar" aria-hidden="true">{initials}</span>
          <span className="educa-user-copy hidden sm:block"><strong>{user?.name ?? profileLabel}</strong><small>{profileLabel}</small></span>
          <button className="educa-logout" aria-label="Sair" onClick={logout}><LogOut size={19} /><span className="hidden lg:inline">Sair</span></button>
        </div>
      </header>
      <main className="educa-main max-w-7xl mx-auto p-5 md:p-9 space-y-6">
        <div>
          <p className="educa-kicker text-sm text-blue-700 font-medium">Aprendizado que transforma</p>
          <h1 className="educa-page-title text-3xl font-bold text-slate-800 mt-2">
            {selected
              ? (d?.turma.nome ?? 'Carregando turma...')
              : manager
                ? 'Gestão educacional'
                : isTeacher
                  ? 'Seu espaço para ensinar'
                  : 'Minhas turmas'}
          </h1>
          <p className="educa-subtitle text-slate-500 mt-2">
            {selected
              ? 'Aulas, materiais e atividades da sua turma.'
              : isTeacher
                ? 'Organize aulas, compartilhe materiais e acompanhe cada aluno.'
                : 'Escolha uma turma para acompanhar aulas, materiais e atividades.'}
          </p>
        </div>
        {message && (
          <p
            role="status"
            className={`p-4 rounded-xl ${message.startsWith('Erro') ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-900'}`}
          >
            {message}
          </p>
        )}
        {(classes.error || detail.error || catalog.error || reports.error) && (
          <p role="alert" className="educa-load-error">
            <span>Não foi possível carregar os dados. Verifique seu acesso ou sua conexão.</span>
            <button type="button" onClick={() => void Promise.all([classes.mutate(), detail.mutate(), catalog.mutate(), reports.mutate()])}>Tentar novamente</button>
          </p>
        )}
        {!selected ? (
          <>
            {!manager && (
              <section className="educa-welcome">
                <div className="educa-welcome-icon">{isTeacher ? <ClipboardCheck /> : <BookOpen />}</div>
                <div>
                  <strong>{isTeacher ? 'Tudo o que sua turma precisa, no mesmo lugar.' : 'Aprender fica mais simples quando o próximo passo está claro.'}</strong>
                  <p>{isTeacher ? 'Prepare os próximos encontros e acompanhe as entregas.' : 'Entre na turma, acompanhe as aulas e encontre seus materiais.'}</p>
                </div>
                <div className="educa-overview">
                  <span><b>{classes.data?.length ?? 0}</b> turmas</span>
                  <span><b>{classes.data?.reduce((sum, item) => sum + item._count.aulas, 0) ?? 0}</b> aulas</span>
                </div>
              </section>
            )}
            <div className="educa-class-grid grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {!classes.data && !classes.error && <p>Carregando turmas...</p>}
              {classes.data?.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelected(c.id)
                    setTab('aulas')
                  }}
                  className="educa-class-card text-left bg-white rounded-2xl border p-6 hover:border-blue-500 transition shadow-sm"
                >
                  <div className="educa-class-card-icon bg-blue-50 text-blue-800 rounded-xl w-12 h-12 grid place-items-center">
                    <BookOpen />
                  </div>
                  <div className="educa-class-heading"><h2 className="font-semibold text-xl mt-5">{c.nome}</h2><span className="educa-status-pill">Turma ativa</span></div>
                  <p className="text-sm text-slate-500 mt-2">
                    <span><CalendarDays /> {c._count.aulas} aulas</span><span><Users /> {c._count.matriculas} matrículas</span>
                  </p>
                  <span className="block mt-6 text-blue-700 text-sm font-semibold">
                    Abrir turma →
                  </span>
                </button>
              ))}
              {classes.data?.length === 0 && (
                <EmptyState title="Nenhuma turma encontrada" text="Procure o gestor do instituto para confirmar seu vínculo." />
              )}
            </div>
            {manager && catalog.data && (
              <div className="grid lg:grid-cols-2 gap-5">
                <Panel title="Acessos de professores e alunos">
                  <p className="text-sm text-slate-500">
                    Vincule um cadastro existente. Se já possui acesso, esta ação redefine a senha.
                  </p>
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      const f = form(e)
                      void action(
                        () =>
                          post('acessos', {
                            perfil: role,
                            registro_id: f.get('registro_id'),
                            senha: f.get('senha'),
                            ...(role === 'aluno'
                              ? { matricula: f.get('matricula') }
                              : { email: f.get('email') }),
                          }),
                        'Acesso salvo. Entregue as credenciais ao usuário por um canal seguro.',
                      )
                    }}
                  >
                    <label className="block text-sm">
                      Perfil
                      <select
                        className="input"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                      >
                        <option value="aluno">Aluno</option>
                        <option value="professor">Professor</option>
                      </select>
                    </label>
                    <label className="block text-sm">
                      Cadastro
                      <select name="registro_id" className="input" required>
                        <option value="">Selecione</option>
                        {role === 'aluno'
                          ? catalog.data.alunos.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                                {a.user?.student_code ? ` · ${a.user.student_code}` : ''}
                              </option>
                            ))
                          : catalog.data.professores.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nome_completo}
                                {p.user_id ? ' · acesso ativo' : ''}
                              </option>
                            ))}
                      </select>
                    </label>
                    {role === 'aluno' ? (
                      <Field
                        name="matricula"
                        label="Matrícula de acesso (3 a 30 letras, números ou hífen)"
                      />
                    ) : (
                      <Field name="email" label="E-mail" type="email" />
                    )}
                    <Field name="senha" label="Senha (mínimo 8 caracteres)" type="password" />
                    <button disabled={busy} className="btn-primary">
                      Salvar acesso
                    </button>
                  </form>
                  <Link href="/educa" className="text-blue-700 text-sm">
                    Página de login dos professores e alunos ↗
                  </Link>
                </Panel>
                <Panel title="Criar turma">
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      const f = form(e)
                      void action(() =>
                        post('turmas', {
                          nome: f.get('nome'),
                          professor_id: f.get('professor_id'),
                          ...(f.get('project_id') ? { project_id: f.get('project_id') } : {}),
                        }),
                      )
                    }}
                  >
                    <Field name="nome" label="Nome da turma" />
                    <label className="block text-sm">
                      Professor
                      <select name="professor_id" className="input" required>
                        <option value="">Selecione um professor com acesso</option>
                        {catalog.data.professores
                          .filter((p) => p.user_id)
                          .map((p) => (
                            <option key={p.id} value={p.user_id!}>
                              {p.nome_completo}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      Projeto
                      <select name="project_id" className="input">
                        <option value="">Sem vínculo</option>
                        {catalog.data.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button disabled={busy} className="btn-primary">
                      Criar turma
                    </button>
                  </form>
                </Panel>
              </div>
            )}
            {manager && (
              <Panel title="Chamadas — controle do gestor">
                <p className="text-sm text-slate-500">
                  As chamadas enviadas pelos professores aparecem aqui. Rascunhos não entram nos
                  totais consolidados.
                </p>
                <div className="flex gap-4 text-sm">
                  <b>{reports.data?.filter((a) => a.chamada_enviada_at).length ?? 0} enviadas</b>
                  <b>{reports.data?.filter((a) => !a.chamada_enviada_at).length ?? 0} pendentes</b>
                </div>
                {reports.data?.length === 0 && <p>Nenhuma aula cadastrada.</p>}
                {reports.data?.map((a) => (
                  <details key={a.id} className="border rounded-xl p-3">
                    <summary className="cursor-pointer">
                      {a.turma?.nome} · {a.titulo} · {date(a.inicio)} ·{' '}
                      {a.chamada_enviada_at ? 'Enviada' : 'Pendente'}
                    </summary>
                    {a.chamada_enviada_at ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm">
                          Enviada em {date(a.chamada_enviada_at)} ·{' '}
                          {a.presencas.filter((p) => p.status === 'PRESENTE').length} presentes
                        </p>
                        {a.presencas.map((p) => (
                          <p key={p.matricula_id} className="text-sm">
                            {p.matricula?.aluno.name} — {p.status}
                          </p>
                        ))}
                        <button
                          disabled={busy}
                          className="btn-secondary"
                          onClick={() =>
                            action(
                              () => post(`aulas/${a.id}/reabrir`),
                              'Chamada reaberta. O professor poderá corrigir e reenviar.',
                            )
                          }
                        >
                          Reabrir para correção
                        </button>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-500">Aguardando envio do professor.</p>
                    )}
                  </details>
                ))}
              </Panel>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setSelected('')
                setMarks({})
              }}
              className="flex items-center gap-2 text-blue-800"
            >
              <ArrowLeft size={16} />
              Todas as turmas
            </button>
            <nav className="educa-tabs flex gap-2 overflow-x-auto" aria-label="Conteúdo da turma">
              {tabs.map(({ id, label, count, icon }) => (
                <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} data-active={tab === id}>
                  {icon}<span>{label}</span><small>{count}</small>
                </button>
              ))}
            </nav>
            {!d && !detail.error && <p>Carregando...</p>}
            {d && (
              <>
                <section className="educa-class-summary" aria-label="Resumo da turma">
                  <div><span>{d.canTeach ? 'Encontros planejados' : 'Aulas disponíveis'}</span><strong>{d.aulas.length}</strong></div>
                  <div><span>Materiais de apoio</span><strong>{d.materiais.length}</strong></div>
                  <div><span>Atividades</span><strong>{d.atividades.length}</strong></div>
                  {d.canTeach ? (
                    <div><span>Alunos ativos</span><strong>{d.matriculas.filter((m) => m.status === 'ATIVA').length}</strong></div>
                  ) : (
                    <div><span>Próximo passo</span><strong className="educa-summary-next">{d.atividades.length ? 'Ver atividades' : d.aulas.length ? 'Acompanhar aulas' : 'Aguardar conteúdo'}</strong></div>
                  )}
                </section>
                {tab === 'aulas' && (
                  <div className="space-y-5">
                    {d.canTeach && (
                      <Panel title="Agendar aula">
                        <form
                          className="grid sm:grid-cols-2 gap-3"
                          onSubmit={(e) => {
                            const f = form(e)
                            void action(() =>
                              post(`turmas/${selected}/aulas`, {
                                titulo: f.get('titulo'),
                                inicio: new Date(String(f.get('inicio'))).toISOString(),
                                fim: new Date(String(f.get('fim'))).toISOString(),
                                meet_url: f.get('meet_url'),
                              }),
                            )
                          }}
                        >
                          <Field name="titulo" label="Título da aula" />
                          <Field name="meet_url" label="Link do Google Meet" type="url" />
                          <Field
                            name="inicio"
                            label="Início (horário local do dispositivo)"
                            type="datetime-local"
                          />
                          <Field name="fim" label="Fim" type="datetime-local" />
                          <p className="text-xs text-slate-500 sm:col-span-2">
                            Crie a reunião no Google Meet e cole o link. Horários exibidos em
                            Brasília.
                          </p>
                          <button disabled={busy} className="btn-primary">
                            Agendar aula
                          </button>
                        </form>
                      </Panel>
                    )}
                    {d.aulas.length === 0 && <EmptyState title="Nenhuma aula agendada" text={d.canTeach ? "Agende o primeiro encontro desta turma." : "As próximas aulas aparecerão aqui."} />}
                    {d.aulas.map((a) => (
                      <Panel key={a.id} title={a.titulo}>
                        <div className="flex flex-wrap gap-4 justify-between items-center">
                          <p className="text-sm text-slate-500">
                            {date(a.inicio)} até {date(a.fim)}
                          </p>
                          <a
                            href={a.meet_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-primary"
                          >
                            <Video size={18} />
                            Entrar no Google Meet
                          </a>
                        </div>
                        {d.canTeach ? (
                          <details className="border-t pt-4">
                            <summary className="cursor-pointer font-semibold">
                              Chamada da aula ·{' '}
                              {a.chamada_enviada_at ? 'Enviada ao gestor' : 'Pendente'}
                            </summary>
                            <div className="mt-4 space-y-3">
                              {d.matriculas
                                .filter(
                                  (m) =>
                                    m.status === 'ATIVA' ||
                                    a.presencas.some((p) => p.matricula_id === m.id),
                                )
                                .map((m) => (
                                  <label
                                    key={m.id}
                                    className="flex items-center justify-between gap-4 text-sm"
                                  >
                                    <span>{m.aluno.name}</span>
                                    <select
                                      aria-label={`Presença de ${m.aluno.name}`}
                                      disabled={!!a.chamada_enviada_at || busy}
                                      className="input max-w-[180px]"
                                      value={
                                        marks[a.id]?.[m.id] ??
                                        a.presencas.find((p) => p.matricula_id === m.id)?.status ??
                                        ''
                                      }
                                      onChange={(e) =>
                                        setMarks((v) => ({
                                          ...v,
                                          [a.id]: { ...v[a.id], [m.id]: e.target.value },
                                        }))
                                      }
                                    >
                                      <option value="">Não marcada</option>
                                      <option value="PRESENTE">Presente</option>
                                      <option value="AUSENTE">Ausente</option>
                                      <option value="JUSTIFICADA">Falta justificada</option>
                                    </select>
                                  </label>
                                ))}
                              {!a.chamada_enviada_at && (
                                <div className="flex flex-wrap gap-3">
                                  <button
                                    disabled={busy}
                                    className="btn-secondary"
                                    onClick={() => attendance(a, false)}
                                  >
                                    Salvar rascunho
                                  </button>
                                  <button
                                    disabled={busy}
                                    className="btn-primary"
                                    onClick={() => attendance(a, true)}
                                  >
                                    Enviar chamada ao gestor
                                  </button>
                                </div>
                              )}
                              <p className="text-xs text-slate-500">
                                A chamada é registrada pelo professor. Abrir o link do Meet não
                                confirma presença.
                              </p>
                            </div>
                          </details>
                        ) : (
                          a.chamada_enviada_at && (
                            <p className="text-sm text-slate-500">
                              Sua presença: {a.presencas[0]?.status ?? 'Sem registro'}
                            </p>
                          )
                        )}
                      </Panel>
                    ))}
                  </div>
                )}
                {tab === 'materiais' && (
                  <div className="space-y-5">
                    {d.canTeach && (
                      <Panel title="Compartilhar material">
                        <form
                          className="space-y-3"
                          onSubmit={(e) => {
                            const f = form(e)
                            void action(async () => {
                              const anexo_id = await upload(f.get('arquivo'))
                              return post(`turmas/${selected}/materiais`, {
                                titulo: f.get('titulo'),
                                texto: f.get('texto'),
                                ...(anexo_id ? { anexo_id } : {}),
                              })
                            })
                          }}
                        >
                          <Field name="titulo" label="Título" />
                          <label className="block text-sm">
                            Orientações
                            <textarea name="texto" className="input" rows={3} />
                          </label>
                          <label className="block text-sm">
                            Arquivo (PDF, JPG ou PNG, até 10 MB)
                            <input
                              name="arquivo"
                              type="file"
                              accept="application/pdf,image/png,image/jpeg"
                              className="block mt-2"
                            />
                          </label>
                          <button disabled={busy} className="btn-primary">
                            Publicar material
                          </button>
                        </form>
                      </Panel>
                    )}
                    {d.materiais.length === 0 && <EmptyState title="Nenhum material publicado" text={d.canTeach ? "Compartilhe o primeiro conteúdo de apoio." : "Os materiais da turma aparecerão aqui."} />}
                    {d.materiais.map((m) => (
                      <Panel key={m.id} title={m.titulo}>
                        <p className="whitespace-pre-wrap text-slate-600">{m.texto}</p>
                        {m.anexo_id && (
                          <button
                            disabled={busy}
                            onClick={() => download(m.anexo_id!)}
                            className="btn-secondary"
                          >
                            Baixar material
                          </button>
                        )}
                      </Panel>
                    ))}
                  </div>
                )}
                {tab === 'atividades' && (
                  <div className="space-y-5">
                    {d.canTeach && (
                      <Panel title="Nova atividade">
                        <form
                          className="space-y-3"
                          onSubmit={(e) => {
                            const f = form(e)
                            void action(() =>
                              post(`turmas/${selected}/atividades`, {
                                titulo: f.get('titulo'),
                                descricao: f.get('descricao'),
                                ...(f.get('prazo')
                                  ? { prazo: new Date(String(f.get('prazo'))).toISOString() }
                                  : {}),
                              }),
                            )
                          }}
                        >
                          <Field name="titulo" label="Título" />
                          <label className="block text-sm">
                            Enunciado
                            <textarea name="descricao" className="input" rows={3} required />
                          </label>
                          <Field
                            name="prazo"
                            label="Prazo de entrega"
                            type="datetime-local"
                            required={false}
                          />
                          <button disabled={busy} className="btn-primary">
                            Publicar atividade
                          </button>
                        </form>
                      </Panel>
                    )}
                    {d.atividades.length === 0 && <EmptyState title="Nenhuma atividade publicada" text={d.canTeach ? "Crie uma atividade para acompanhar o aprendizado." : "Novas atividades aparecerão aqui."} />}
                    {d.atividades.map((a) => (
                      <Panel key={a.id} title={a.titulo}>
                        <p className="whitespace-pre-wrap">{a.descricao}</p>
                        <p className="text-xs text-slate-500">
                          {a.prazo
                            ? `Prazo: ${date(a.prazo)} · Entregas posteriores ficam registradas como atrasadas pela data.`
                            : 'Sem prazo definido'}
                        </p>
                        {a.entregas.map((e) => (
                          <div key={e.id} className="bg-slate-50 rounded-xl p-4 space-y-3">
                            <p className="font-semibold text-sm">
                              {e.matricula.aluno.name} · {e.status}
                              {e.entregue_at &&
                              a.prazo &&
                              new Date(e.entregue_at) > new Date(a.prazo)
                                ? ' · Entregue com atraso'
                                : ''}
                            </p>
                            <p className="whitespace-pre-wrap text-sm">{e.conteudo}</p>
                            {e.anexos.map((id, i) => (
                              <button
                                key={id}
                                disabled={busy}
                                className="btn-secondary mr-2"
                                onClick={() => download(id)}
                              >
                                Anexo {i + 1}
                              </button>
                            ))}
                            {e.status === 'AVALIADA' && (
                              <p className="text-sm text-blue-800">
                                {e.nota !== null ? `Nota: ${e.nota} · ` : ''}
                                {e.feedback || 'Atividade concluída.'}
                              </p>
                            )}
                            {d.canTeach && (
                              <form
                                className="flex flex-wrap gap-3"
                                onSubmit={(event) => {
                                  const f = form(event)
                                  void action(() =>
                                    post(`entregas/${e.id}/avaliar`, {
                                      feedback: f.get('feedback'),
                                      ...(f.get('nota') !== ''
                                        ? { nota: Number(f.get('nota')) }
                                        : {}),
                                    }),
                                  )
                                }}
                              >
                                <input
                                  aria-label="Nota de 0 a 10"
                                  name="nota"
                                  type="number"
                                  min={0}
                                  max={10}
                                  step="0.1"
                                  defaultValue={e.nota ?? ''}
                                  placeholder="Nota (opcional)"
                                  className="input max-w-[160px]"
                                />
                                <input
                                  aria-label="Comentário"
                                  name="feedback"
                                  defaultValue={e.feedback ?? ''}
                                  placeholder="Comentário ao aluno"
                                  className="input flex-1"
                                />
                                <button disabled={busy} className="btn-primary">
                                  Concluir avaliação
                                </button>
                              </form>
                            )}
                          </div>
                        ))}
                        {d.canTeach && a.entregas.length === 0 && (
                          <p className="text-sm text-slate-500">Aguardando entregas.</p>
                        )}
                        {!d.canTeach && a.entregas[0]?.status !== 'AVALIADA' && (
                          <form
                            className="space-y-3 border-t pt-4"
                            onSubmit={(e) => {
                              const f = form(e)
                              void action(async () => {
                                const id = await upload(f.get('arquivo'))
                                const anexos = [
                                  ...(a.entregas[0]?.anexos ?? []),
                                  ...(id ? [id] : []),
                                ]
                                return post(`atividades/${a.id}/entrega`, {
                                  conteudo: f.get('conteudo'),
                                  anexos,
                                })
                              }, 'Atividade enviada ao professor.')
                            }}
                          >
                            <label className="block text-sm">
                              Sua resposta
                              <textarea
                                name="conteudo"
                                className="input"
                                rows={3}
                                defaultValue={a.entregas[0]?.conteudo ?? ''}
                              />
                            </label>
                            <label className="block text-sm">
                              Adicionar foto ou PDF (até 5 anexos de 10 MB)
                              <input
                                name="arquivo"
                                type="file"
                                accept="application/pdf,image/png,image/jpeg"
                                className="block mt-2"
                              />
                            </label>
                            <button disabled={busy} className="btn-primary">
                              {a.entregas.length ? 'Atualizar entrega' : 'Enviar atividade'}
                            </button>
                          </form>
                        )}
                      </Panel>
                    ))}
                  </div>
                )}
                {tab === 'alunos' && manager && (
                  <Panel title="Alunos da turma">
                    <form
                      className="flex gap-3"
                      onSubmit={(e) => {
                        const f = form(e)
                        void action(() =>
                          post(`turmas/${selected}/matriculas`, { aluno_id: f.get('aluno_id') }),
                        )
                      }}
                    >
                      <select aria-label="Beneficiário" name="aluno_id" required className="input">
                        <option value="">Selecione um beneficiário cadastrado</option>
                        {catalog.data?.alunos.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      <button disabled={busy} className="btn-primary">
                        Matricular
                      </button>
                    </form>
                    {d.matriculas.map((m) => (
                      <p key={m.id} className="text-sm border-t pt-3">
                        {m.aluno.name} · {m.status}
                      </p>
                    ))}
                  </Panel>
                )}
              </>
            )}
          </>
        )}
      </main>
      <footer className="text-center text-xs text-slate-400 py-6">
        Educa Amparo Gov · Ensino e acompanhamento no mesmo lugar
      </footer>
    </div>
  )
}







