import { FormEvent, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  FileText,
  Paperclip,
  Send,
  X,
} from 'lucide-react'
import api from '@/lib/api'
import type { Detail, Delivery } from './types'
import { Badge, EmptyState } from './EducaUI'
import { dateTime, errorText, studentActivityStatus } from './educa-utils'
import { useUnsavedWork } from './useUnsavedWork'

type Activity = Detail['atividades'][number]
function DeliveryCard({
  delivery,
  teacher,
  download,
  onSaved,
}: {
  delivery: Delivery
  teacher: boolean
  download: (id: string) => Promise<unknown>
  onSaved: () => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  useUnsavedWork(dirty)
  async function grade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const data = new FormData(event.currentTarget)
    try {
      await api.post(`/educa/entregas/${delivery.id}/avaliar`, {
        feedback: data.get('feedback'),
        ...(data.get('nota') !== '' ? { nota: Number(data.get('nota')) } : {}),
      })
      setDirty(false)
      await onSaved()
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="edu-submission">
      <div className="edu-submission-heading">
        <strong>{teacher ? delivery.matricula.aluno.name : 'Sua entrega'}</strong>
        <Badge tone={delivery.status === 'AVALIADA' ? 'green' : 'blue'}>
          {delivery.status === 'AVALIADA' ? 'Avaliada' : 'Entregue'}
        </Badge>
      </div>
      {delivery.entregue_at && (
        <small className="edu-caption">Enviada em {dateTime(delivery.entregue_at)}</small>
      )}
      <p className="edu-reading">{delivery.conteudo}</p>
      {delivery.anexos.length > 0 && (
        <div className="edu-attachment-list">
          {delivery.anexos.map((id, index) => (
            <button
              key={id}
              type="button"
              className="edu-attachment"
              onClick={() => void download(id)}
            >
              <Paperclip size={13} />
              Anexo {index + 1}
              <Download size={13} />
            </button>
          ))}
        </div>
      )}
      {delivery.status === 'AVALIADA' && (
        <div className="edu-submission-feedback">
          {delivery.nota !== null && <strong>Nota: {delivery.nota} · </strong>}
          {delivery.feedback || 'Atividade concluída. Muito bem!'}
        </div>
      )}
      {teacher && (
        <form onSubmit={grade} onChange={() => setDirty(true)} className="edu-grade-form">
          <label className="edu-field">
            <span>Nota (opcional)</span>
            <input
              className="input"
              type="number"
              name="nota"
              min={0}
              max={10}
              step="0.1"
              defaultValue={delivery.nota ?? ''}
              aria-label={`Nota de ${delivery.matricula.aluno.name}`}
              placeholder="0 a 10"
            />
          </label>
          <label className="edu-field">
            <span>Comentário ao aluno</span>
            <input
              className="input"
              name="feedback"
              defaultValue={delivery.feedback ?? ''}
              maxLength={5000}
              placeholder="Valorize a descoberta e oriente o próximo passo."
            />
          </label>
          <button disabled={busy} type="submit" className="edu-btn edu-btn-primary">
            <CheckCircle2 size={15} />
            {busy ? 'Salvando...' : 'Concluir avaliação'}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="edu-alert edu-alert-error">
          {error}
        </p>
      )}
    </div>
  )
}

function ActivityCard({
  activity,
  teacher,
  classId,
  focused,
  download,
  onSaved,
}: {
  activity: Activity
  teacher: boolean
  classId: string
  focused: boolean
  download: (id: string) => Promise<unknown>
  onSaved: () => Promise<unknown>
}) {
  const [open, setOpen] = useState(focused)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [keptAttachments, setKeptAttachments] = useState(activity.entregas[0]?.anexos ?? [])
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  useUnsavedWork(dirty)
  const pending = activity.entregas.filter((item) => item.status === 'ENTREGUE').length
  const badge = teacher
    ? pending
      ? { label: `${pending} para corrigir`, tone: 'red' }
      : activity.entregas.length
        ? { label: 'Entregas avaliadas', tone: 'green' }
        : { label: 'Aguardando entregas', tone: 'neutral' }
    : studentActivityStatus(activity.entregas, activity.prazo)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    const formElement = event.currentTarget
    const data = new FormData(formElement)
    const files = data
      .getAll('arquivos')
      .filter((file): file is File => file instanceof File && file.size > 0)
    try {
      if (keptAttachments.length + files.length > 5)
        throw new Error(
          'A entrega pode ter até 5 anexos. Remova um arquivo antes de acrescentar outro.',
        )
      if (!String(data.get('conteudo') ?? '').trim() && !files.length && !keptAttachments.length)
        throw new Error('Escreva uma resposta ou adicione uma foto ou PDF para enviar a atividade.')
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024)
          throw new Error(`O arquivo ${file.name} ultrapassa 10 MB.`)
        if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type))
          throw new Error('Escolha arquivos PDF, JPG ou PNG.')
      }
      const attachments = [...keptAttachments]
      for (const file of files) {
        const upload = new FormData()
        upload.append('file', file)
        attachments.push((await api.post(`/educa/turmas/${classId}/arquivos`, upload)).data.id)
      }
      await api.post(`/educa/atividades/${activity.id}/entrega`, {
        conteudo: data.get('conteudo'),
        anexos: attachments,
      })
      setDirty(false)
      setKeptAttachments(attachments)
      setSelectedFiles([])
      const input = formElement.elements.namedItem('arquivos') as HTMLInputElement | null
      if (input) input.value = ''
      await onSaved()
      setMessage('Atividade enviada! O professor já pode acompanhar sua entrega.')
    } catch (caught) {
      setError(
        (caught as { response?: unknown }).response
          ? errorText(caught)
          : caught instanceof Error
            ? caught.message
            : errorText(caught),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className="edu-activity-card">
      <button
        type="button"
        className="edu-activity-toggle"
        aria-expanded={open}
        aria-controls={`activity-${activity.id}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`edu-pending-icon edu-tone-${teacher ? 'blue' : badge.tone}`}>
          <FileText size={19} />
        </span>
        <span className="edu-activity-name">
          <strong>{activity.titulo}</strong>
          <small>
            {activity.prazo ? `Entrega até ${dateTime(activity.prazo)}` : 'Sem prazo definido'}
            {teacher ? ` · ${activity.entregas.length} entrega(s)` : ''}
          </small>
        </span>
        <Badge tone={badge.tone}>{badge.label}</Badge>
        <ChevronDown size={17} />
      </button>
      {open && (
        <div className="edu-activity-body" id={`activity-${activity.id}`}>
          <div className="edu-activity-description">
            {activity.descricao || 'Veja as orientações com seu professor.'}
          </div>
          {activity.prazo &&
            new Date(activity.prazo) < new Date() &&
            !teacher &&
            !activity.entregas.length && (
              <p className="edu-caption">
                O prazo já passou. Você ainda pode enviar; a entrega ficará registrada com a data
                atual.
              </p>
            )}
          {activity.entregas.map((delivery) => (
            <DeliveryCard
              key={delivery.id}
              delivery={delivery}
              teacher={teacher}
              download={download}
              onSaved={onSaved}
            />
          ))}
          {teacher && !activity.entregas.length && (
            <p className="edu-caption">As entregas dos alunos aparecerão aqui.</p>
          )}
          {!teacher && activity.entregas[0]?.status !== 'AVALIADA' && (
            <form className="edu-activity-form" onChange={() => setDirty(true)} onSubmit={submit}>
              <h3>
                {activity.entregas.length ? 'Quer complementar sua entrega?' : 'Agora é com você!'}
              </h3>
              <label className="edu-field">
                <span>Sua resposta</span>
                <textarea
                  className="input"
                  name="conteudo"
                  rows={4}
                  maxLength={20000}
                  defaultValue={activity.entregas[0]?.conteudo ?? ''}
                  placeholder="Conte o que você aprendeu ou escreva sua resposta aqui..."
                />
              </label>
              {keptAttachments.length > 0 && (
                <div className="edu-attachment-list">
                  {keptAttachments.map((id, index) => (
                    <span key={id} className="edu-attachment">
                      <Paperclip size={13} />
                      Anexo {index + 1}
                      <button
                        type="button"
                        aria-label={`Remover anexo ${index + 1} da entrega`}
                        onClick={() => {
                          setDirty(true)
                          setKeptAttachments((current) => current.filter((value) => value !== id))
                        }}
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <label className="edu-upload">
                <strong>
                  <Paperclip size={16} className="inline mr-1" />
                  Adicionar fotos ou PDF
                </strong>
                <span>Até 5 anexos por entrega · 10 MB por arquivo</span>
                <input
                  type="file"
                  name="arquivos"
                  accept="application/pdf,image/png,image/jpeg"
                  multiple
                  onChange={(event) =>
                    setSelectedFiles(Array.from(event.target.files ?? []).map((file) => file.name))
                  }
                />
                {selectedFiles.map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </label>
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
              <div className="edu-button-row">
                <button className="edu-btn edu-btn-primary" disabled={busy} type="submit">
                  <Send size={16} />
                  {busy
                    ? 'Enviando sua atividade...'
                    : activity.entregas.length
                      ? 'Atualizar entrega'
                      : 'Enviar atividade'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </article>
  )
}

export function EducaActivities({
  detail,
  classId,
  search,
  focusedId,
  download,
  onSaved,
}: {
  detail: Detail
  classId: string
  search: string
  focusedId?: string
  download: (id: string) => Promise<unknown>
  onSaved: () => Promise<unknown>
}) {
  const [filter, setFilter] = useState('todas')
  const teacher = detail.canTeach
  function matches(activity: Activity, value: string) {
    if (value === 'todas') return true
    if (teacher)
      return value === 'pendentes'
        ? activity.entregas.some((item) => item.status === 'ENTREGUE')
        : activity.entregas.length > 0 &&
            activity.entregas.every((item) => item.status === 'AVALIADA')
    return value === 'pendentes'
      ? !activity.entregas.length
      : value === 'entregues'
        ? activity.entregas.some((item) => item.status === 'ENTREGUE')
        : activity.entregas[0]?.status === 'AVALIADA'
  }
  const filters = [
    { id: 'todas', label: 'Todas' },
    { id: 'pendentes', label: teacher ? 'Para corrigir' : 'Para fazer' },
    ...(!teacher ? [{ id: 'entregues', label: 'Entregues' }] : []),
    { id: 'avaliadas', label: 'Avaliadas' },
  ]
  const visible = detail.atividades.filter(
    (activity) =>
      matches(activity, filter) &&
      `${activity.titulo} ${activity.descricao}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.toLocaleLowerCase('pt-BR')),
  )
  return (
    <>
      <div className="edu-toolbar">
        <div className="edu-filters" aria-label="Filtrar atividades por situação">
          {filters.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <small>
                {detail.atividades.filter((activity) => matches(activity, item.id)).length}
              </small>
            </button>
          ))}
        </div>
      </div>
      {!visible.length && (
        <EmptyState
          title={!detail.atividades.length ? 'Novas descobertas vêm por aí' : 'Tudo certo por aqui'}
          text={
            !detail.atividades.length
              ? teacher
                ? 'Crie a primeira atividade e acompanhe o aprendizado da turma.'
                : 'As atividades publicadas pelo professor aparecerão aqui.'
              : 'Nenhuma atividade corresponde à busca ou ao filtro selecionado.'
          }
        />
      )}
      <div className="edu-activity-list">
        {visible.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            teacher={teacher}
            classId={classId}
            focused={activity.id === focusedId}
            download={download}
            onSaved={onSaved}
          />
        ))}
      </div>
    </>
  )
}
