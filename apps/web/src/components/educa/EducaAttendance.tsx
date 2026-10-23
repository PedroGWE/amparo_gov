import { useState } from 'react'
import { Check, CheckCheck, Save, Send, Users } from 'lucide-react'
import api from '@/lib/api'
import type { Detail, Lesson } from './types'
import { dateTime, initials, errorText } from './educa-utils'
import { Badge, EmptyState, SearchField } from './EducaUI'
import { useUnsavedWork } from './useUnsavedWork'

export function EducaAttendance({
  lesson,
  detail,
  onSaved,
}: {
  lesson: Lesson
  detail: Detail
  onSaved: () => Promise<unknown>
}) {
  const [marks, setMarks] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useUnsavedWork(Object.keys(marks).length > 0)
  const active = detail.matriculas.filter((item) => item.status === 'ATIVA')
  const roster = detail.matriculas.filter(
    (item) =>
      item.status === 'ATIVA' || lesson.presencas.some((mark) => mark.matricula_id === item.id),
  )
  const status = (id: string) =>
    marks[id] ?? lesson.presencas.find((item) => item.matricula_id === id)?.status ?? ''
  const present = active.filter((item) => status(item.id) === 'PRESENTE').length
  const absent = active.filter((item) => status(item.id) === 'AUSENTE').length
  const remaining = active.filter((item) => !status(item.id)).length
  const locked = !!lesson.chamada_enviada_at
  const [confirmSend, setConfirmSend] = useState(false)
  async function save(send: boolean) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api.post(`/educa/aulas/${lesson.id}/${send ? 'enviar' : 'rascunho'}`, {
        versao: lesson.versao,
        itens: active.flatMap((item) =>
          status(item.id) ? [{ matricula_id: item.id, status: status(item.id) }] : [],
        ),
      })
      setMarks({})
      setConfirmSend(false)
      await onSaved()
      setMessage(
        send
          ? 'Chamada enviada ao gestor com sucesso.'
          : 'Rascunho salvo. Você pode continuar depois.',
      )
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(false)
    }
  }
  if (!detail.canTeach)
    return (
      <div className="edu-note">
        {locked ? (
          <>
            <Check size={18} />
            Sua presença:{' '}
            <strong>
              {lesson.presencas[0]?.status === 'PRESENTE'
                ? 'Presente'
                : lesson.presencas[0]?.status === 'JUSTIFICADA'
                  ? 'Falta justificada'
                  : lesson.presencas[0]?.status === 'AUSENTE'
                    ? 'Ausente'
                    : 'Sem registro'}
            </strong>
          </>
        ) : (
          <>A presença será informada pelo professor após a aula.</>
        )}
      </div>
    )
  return (
    <div className="edu-attendance">
      <div className="edu-attendance-stats">
        <div className="edu-tone-blue">
          <Users />
          <strong>{active.length}</strong>
          <span>alunos</span>
        </div>
        <div className="edu-tone-green">
          <Check />
          <strong>{present}</strong>
          <span>presentes</span>
        </div>
        <div className="edu-tone-red">
          <Users />
          <strong>{absent}</strong>
          <span>ausentes</span>
        </div>
      </div>
      <div className="edu-toolbar">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Buscar aluno na chamada..."
          label="Buscar aluno na chamada"
        />
        {locked ? (
          <Badge tone="green">Enviada em {dateTime(lesson.chamada_enviada_at!)}</Badge>
        ) : (
          <Badge tone={remaining ? 'yellow' : 'green'}>
            {remaining ? `${remaining} para marcar` : 'Todos marcados'}
          </Badge>
        )}
      </div>
      {!roster.length && (
        <EmptyState
          title="Nenhum aluno matriculado"
          text="Solicite ao gestor a vinculação dos alunos desta turma."
        />
      )}
      <div className="edu-roster">
        {roster
          .filter((item) =>
            item.aluno.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')),
          )
          .map((item) => (
            <div key={item.id} className="edu-roster-row">
              <span className="edu-avatar edu-avatar-small">{initials(item.aluno.name)}</span>
              <span className="edu-roster-name">
                {item.aluno.name}
                {item.status !== 'ATIVA' && <small>Vínculo encerrado</small>}
              </span>
              <label className="edu-attendance-select" data-status={status(item.id)}>
                <span className="sr-only">Presença de {item.aluno.name}</span>
                <select
                  value={status(item.id)}
                  disabled={locked || busy || item.status !== 'ATIVA'}
                  onChange={(event) => {
                    setMarks((current) => ({ ...current, [item.id]: event.target.value }))
                    setConfirmSend(false)
                    setMessage('')
                  }}
                >
                  <option value="">Não marcada</option>
                  <option value="PRESENTE">Presente</option>
                  <option value="AUSENTE">Ausente</option>
                  <option value="JUSTIFICADA">Justificada</option>
                </select>
              </label>
            </div>
          ))}
      </div>
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
      {!locked && active.length > 0 && (
        <>
          <div className="edu-attendance-actions">
            <button
              type="button"
              className="edu-btn edu-btn-soft"
              disabled={busy}
              onClick={() => {
                setMarks(Object.fromEntries(active.map((item) => [item.id, 'PRESENTE'])))
                setConfirmSend(false)
              }}
            >
              <CheckCheck size={17} />
              Marcar todos presentes
            </button>
            <div>
              <button
                type="button"
                className="edu-btn edu-btn-outline"
                disabled={busy}
                onClick={() => save(false)}
              >
                <Save size={17} />
                Salvar rascunho
              </button>
              <button
                type="button"
                className="edu-btn edu-btn-primary"
                disabled={busy || remaining > 0}
                onClick={() => setConfirmSend(true)}
              >
                <Send size={17} />
                Revisar e enviar
              </button>
            </div>
          </div>
          {confirmSend && (
            <div className="edu-confirm" role="region" aria-label="Confirmar envio da chamada">
              <div>
                <strong>Enviar a chamada ao gestor?</strong>
                <p>
                  {present} presentes, {absent} ausentes e {active.length - present - absent} faltas
                  justificadas. Após o envio, correções precisam de reabertura pelo gestor.
                </p>
              </div>
              <div className="edu-button-row">
                <button
                  type="button"
                  className="edu-btn edu-btn-quiet"
                  onClick={() => setConfirmSend(false)}
                >
                  Revisar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="edu-btn edu-btn-primary"
                  onClick={() => save(true)}
                >
                  Confirmar envio
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <p className="edu-caption">
        {locked
          ? 'Para corrigir uma chamada enviada, solicite a reabertura ao gestor.'
          : 'Marque a situação de todos os alunos antes de enviar. Abrir o Google Meet não registra presença.'}
      </p>
    </div>
  )
}
