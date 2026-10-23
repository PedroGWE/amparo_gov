import { FormEvent, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { KeyRound, Plus, RotateCcw, Users } from 'lucide-react'
import api from '@/lib/api'
import type { Catalog, Detail, Lesson } from './types'
import { Badge, EmptyState, Field, Loading, Panel } from './EducaUI'
import { dateTime, errorText, initials } from './educa-utils'

export function EducaManagement({
  view,
  tenant,
  onSaved,
  detail,
}: {
  view: 'acessos' | 'relatorios' | 'turma' | 'alunos'
  tenant: string
  onSaved: () => Promise<unknown>
  detail?: Detail
}) {
  const [profile, setProfile] = useState('aluno')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const catalog = useSWR<Catalog>(
    view !== 'relatorios' ? `/educa/cadastros?org=${tenant}` : null,
    (url: string) => api.get(url).then((response) => response.data),
  )
  const reports = useSWR<Lesson[]>(
    view === 'relatorios' ? `/educa/chamadas?org=${tenant}` : null,
    (url: string) => api.get(url).then((response) => response.data),
  )
  async function action(fn: () => Promise<unknown>, success: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await fn()
      await Promise.all([catalog.mutate(), reports.mutate(), onSaved()])
      setMessage(success)
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(false)
    }
  }
  async function account(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const alreadyHasAccess =
      profile === 'aluno'
        ? catalog.data?.alunos.find((item) => item.id === data.get('registro_id'))?.user_id
        : catalog.data?.professores.find((item) => item.id === data.get('registro_id'))?.user_id
    if (
      alreadyHasAccess &&
      !window.confirm(
        'Este cadastro já tem acesso. Deseja redefinir a senha? O acesso anterior precisará ser atualizado.',
      )
    )
      return
    await action(
      () =>
        api.post('/educa/acessos', {
          perfil: profile,
          registro_id: data.get('registro_id'),
          senha: data.get('senha'),
          ...(profile === 'aluno'
            ? { matricula: data.get('matricula') }
            : { email: data.get('email') }),
        }),
      'Acesso salvo. Entregue as credenciais ao usuário por um canal seguro.',
    )
  }
  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="edu-alert edu-alert-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="edu-alert edu-alert-success">
          {message}
        </p>
      )}
      {(catalog.error || reports.error) && (
        <p role="alert" className="edu-alert edu-alert-error">
          Não foi possível carregar os cadastros.{' '}
          <button
            type="button"
            onClick={() => {
              void catalog.mutate()
              void reports.mutate()
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {view === 'acessos' && (
        <Panel
          title="Acesso para aprender e ensinar"
          description="Vincule um cadastro existente e prepare o acesso individual."
        >
          {!catalog.data && !catalog.error ? (
            <Loading />
          ) : (
            catalog.data && (
              <form onSubmit={account} className="edu-form max-w-xl">
                <label className="edu-field">
                  <span>Perfil</span>
                  <select
                    className="input"
                    value={profile}
                    onChange={(event) => setProfile(event.target.value)}
                  >
                    <option value="aluno">Aluno</option>
                    <option value="professor">Professor</option>
                  </select>
                </label>
                <label className="edu-field">
                  <span>Cadastro *</span>
                  <select className="input" name="registro_id" required>
                    <option value="">Selecione o cadastro</option>
                    {profile === 'aluno'
                      ? catalog.data.alunos.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                            {item.user_id ? ' · já possui acesso' : ''}
                          </option>
                        ))
                      : catalog.data.professores.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome_completo}
                            {item.user_id ? ' · já possui acesso' : ''}
                          </option>
                        ))}
                  </select>
                </label>
                {profile === 'aluno' ? (
                  <Field
                    name="matricula"
                    label="Matrícula de acesso"
                    placeholder="3 a 30 letras, números ou hífen"
                  />
                ) : (
                  <Field name="email" type="email" label="E-mail do professor" />
                )}
                <label className="edu-field">
                  <span>Senha inicial *</span>
                  <input
                    className="input"
                    name="senha"
                    type="password"
                    minLength={8}
                    maxLength={100}
                    required
                    autoComplete="new-password"
                    placeholder="Pelo menos 8 caracteres"
                  />
                </label>
                <p className="edu-form-info">
                  Se o cadastro já tiver acesso, a senha será redefinida. Informe as credenciais
                  diretamente ao aluno ou professor.
                </p>
                <div className="edu-button-row">
                  <button className="edu-btn edu-btn-primary" disabled={busy}>
                    <KeyRound size={16} />
                    {busy ? 'Salvando...' : 'Salvar acesso'}
                  </button>
                </div>
                <Link href="/educa" target="_blank" className="edu-text-button">
                  Abrir página de acesso do Educa
                </Link>
              </form>
            )
          )}
        </Panel>
      )}
      {view === 'turma' && (
        <Panel
          title="Criar uma turma"
          description="Organize os participantes e indique o professor responsável."
        >
          <form
            className="edu-form"
            onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              void action(
                () =>
                  api.post('/educa/turmas', {
                    nome: data.get('nome'),
                    professor_id: data.get('professor_id'),
                    ...(data.get('project_id') ? { project_id: data.get('project_id') } : {}),
                  }),
                'Turma criada com sucesso.',
              )
            }}
          >
            <Field name="nome" label="Nome da turma" maxLength={150} />
            <label className="edu-field">
              <span>Professor com acesso *</span>
              <select name="professor_id" className="input" required>
                <option value="">Selecione o professor</option>
                {catalog.data?.professores
                  .filter((item) => item.user_id)
                  .map((item) => (
                    <option key={item.id} value={item.user_id!}>
                      {item.nome_completo}
                    </option>
                  ))}
              </select>
            </label>
            <label className="edu-field">
              <span>Projeto vinculado</span>
              <select className="input" name="project_id">
                <option value="">Sem projeto definido</option>
                {catalog.data?.projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="edu-button-row">
              <button disabled={busy || !catalog.data} className="edu-btn edu-btn-primary">
                <Plus size={16} />
                Criar turma
              </button>
            </div>
          </form>
        </Panel>
      )}
      {view === 'alunos' && detail && (
        <Panel title="Participantes da turma">
          <form
            className="edu-toolbar"
            onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              void action(
                () =>
                  api.post(`/educa/turmas/${detail.turma.id}/matriculas`, {
                    aluno_id: data.get('aluno_id'),
                  }),
                'Aluno matriculado na turma.',
              )
            }}
          >
            <label className="edu-field flex-1">
              <span>Beneficiário cadastrado</span>
              <select className="input" name="aluno_id" required>
                <option value="">Selecione um aluno</option>
                {catalog.data?.alunos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy || !catalog.data} className="edu-btn edu-btn-primary">
              <Users size={16} />
              Matricular aluno
            </button>
          </form>
          <div className="edu-roster">
            {detail.matriculas.map((item) => (
              <div className="edu-roster-row" key={item.id}>
                <span className="edu-avatar">{initials(item.aluno.name)}</span>
                <span className="edu-roster-name">{item.aluno.name}</span>
                <Badge tone={item.status === 'ATIVA' ? 'green' : 'neutral'}>
                  {item.status === 'ATIVA'
                    ? 'Matriculado'
                    : item.status === 'EM_ESPERA'
                      ? 'Reserva'
                      : 'Vínculo encerrado'}
                </Badge>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {view === 'relatorios' && (
        <Panel
          title="Chamadas recebidas"
          description="Acompanhe os envios dos professores. Rascunhos ficam separados das chamadas enviadas."
        >
          {!reports.data && !reports.error && <Loading />}
          {reports.data && (
            <div className="edu-toolbar">
              <Badge tone="green">
                {reports.data.filter((item) => item.chamada_enviada_at).length} enviadas
              </Badge>
              <Badge tone="yellow">
                {reports.data.filter((item) => !item.chamada_enviada_at).length} aguardando envio
              </Badge>
            </div>
          )}
          {reports.data?.length === 0 && (
            <EmptyState
              title="As chamadas aparecerão aqui"
              text="Os professores enviam a chamada após registrar a presença de todos os alunos."
            />
          )}
          <div className="edu-lesson-list">
            {reports.data?.map((lesson) => (
              <details key={lesson.id} className="edu-panel">
                <summary className="cursor-pointer">
                  <strong>{lesson.titulo}</strong>
                  <p className="edu-caption">
                    {lesson.turma?.nome} · {dateTime(lesson.inicio)} ·{' '}
                    {lesson.chamada_enviada_at ? 'Enviada' : 'Aguardando envio'}
                  </p>
                </summary>
                {lesson.chamada_enviada_at ? (
                  <div className="mt-5 space-y-3">
                    <p className="edu-caption">
                      Enviada em {dateTime(lesson.chamada_enviada_at)} ·{' '}
                      {lesson.presencas.filter((item) => item.status === 'PRESENTE').length}{' '}
                      presentes
                    </p>
                    <div className="edu-roster">
                      {lesson.presencas.map((mark) => (
                        <div className="edu-roster-row" key={mark.matricula_id}>
                          <span className="edu-roster-name">{mark.matricula?.aluno.name}</span>
                          <Badge
                            tone={
                              mark.status === 'PRESENTE'
                                ? 'green'
                                : mark.status === 'AUSENTE'
                                  ? 'red'
                                  : 'yellow'
                            }
                          >
                            {mark.status === 'PRESENTE'
                              ? 'Presente'
                              : mark.status === 'AUSENTE'
                                ? 'Ausente'
                                : 'Justificada'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      className="edu-btn edu-btn-outline"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Reabrir esta chamada para o professor corrigir? Ela precisará ser enviada novamente.',
                          )
                        )
                          void action(
                            () => api.post(`/educa/aulas/${lesson.id}/reabrir`),
                            'Chamada reaberta para correção.',
                          )
                      }}
                    >
                      <RotateCcw size={15} />
                      Reabrir para correção
                    </button>
                  </div>
                ) : (
                  <p className="edu-caption mt-4">Aguardando o envio pelo professor.</p>
                )}
              </details>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
