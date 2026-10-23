import { FormEvent, useState } from 'react'
import { FilePlus2, Send } from 'lucide-react'
import api from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Field } from './EducaUI'
import { errorText } from './educa-utils'
import { useUnsavedWork } from './useUnsavedWork'

export type ComposerKind = 'aula' | 'material' | 'atividade'
export function EducaComposer({
  kind,
  classId,
  onClose,
  onSaved,
}: {
  kind: ComposerKind
  classId: string
  onClose: () => void
  onSaved: () => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [dirty, setDirty] = useState(false)
  useUnsavedWork(dirty)
  function close() {
    if (
      !busy &&
      (!dirty || window.confirm('Deseja descartar as informações que ainda não foram publicadas?'))
    )
      onClose()
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const data = new FormData(event.currentTarget)
    try {
      const title = String(data.get('titulo') ?? '').trim()
      if (title.length < 2) throw new Error('Informe um título com pelo menos 2 caracteres.')
      if (kind === 'aula') {
        const inicio = new Date(String(data.get('inicio')))
        const fim = new Date(String(data.get('fim')))
        if (fim <= inicio) throw new Error('O horário de término deve ser posterior ao início.')
        if (
          !/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(
            String(data.get('meet_url')).trim(),
          )
        )
          throw new Error(
            'Cole um link do Google Meet no formato https://meet.google.com/abc-defg-hij.',
          )
        await api.post(`/educa/turmas/${classId}/aulas`, {
          titulo: title,
          inicio: inicio.toISOString(),
          fim: fim.toISOString(),
          meet_url: String(data.get('meet_url')).trim(),
        })
      } else if (kind === 'atividade') {
        await api.post(`/educa/turmas/${classId}/atividades`, {
          titulo: title,
          descricao: data.get('descricao'),
          ...(data.get('prazo')
            ? { prazo: new Date(String(data.get('prazo'))).toISOString() }
            : {}),
        })
      } else {
        const file = data.get('arquivo')
        let attachment: string | undefined
        if (file instanceof File && file.size) {
          if (file.size > 10 * 1024 * 1024) throw new Error('O arquivo deve ter até 10 MB.')
          if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type))
            throw new Error('Escolha um arquivo PDF, JPG ou PNG.')
          const upload = new FormData()
          upload.append('file', file)
          attachment = (await api.post(`/educa/turmas/${classId}/arquivos`, upload)).data.id
        }
        await api.post(`/educa/turmas/${classId}/materiais`, {
          titulo: title,
          texto: data.get('texto'),
          ...(attachment ? { anexo_id: attachment } : {}),
        })
      }
      setDirty(false)
      await onSaved()
      onClose()
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
  const title =
    kind === 'aula'
      ? 'Agendar uma aula'
      : kind === 'atividade'
        ? 'Criar uma atividade'
        : 'Compartilhar material'
  return (
    <Modal open onClose={close} title={title} size="lg">
      <div className="edu-app" style={{ minHeight: 0, background: 'transparent' }}>
        <form className="edu-form" onChange={() => setDirty(true)} onSubmit={submit}>
          <Field
            name="titulo"
            label={kind === 'aula' ? 'Título da aula' : 'Título'}
            placeholder={
              kind === 'atividade'
                ? 'O que vamos descobrir hoje?'
                : kind === 'aula'
                  ? 'Ex.: Nosso próximo encontro'
                  : 'Ex.: Material de apoio'
            }
            maxLength={200}
          />
          {kind === 'aula' ? (
            <>
              <Field
                name="meet_url"
                type="url"
                label="Link do Google Meet"
                placeholder="https://meet.google.com/abc-defg-hij"
              />
              <div className="edu-form-columns">
                <Field name="inicio" type="datetime-local" label="Início da aula" />
                <Field name="fim" type="datetime-local" label="Término da aula" />
              </div>
              <p className="edu-form-info">
                Crie a reunião no Google Meet e cole o link acima. Informe o horário local do seu
                dispositivo; o portal exibe os encontros no horário de Brasília.
              </p>
            </>
          ) : kind === 'atividade' ? (
            <>
              <label className="edu-field">
                <span>O que os alunos devem fazer? *</span>
                <textarea
                  className="input"
                  name="descricao"
                  rows={5}
                  required
                  maxLength={20000}
                  placeholder="Explique a proposta e como a atividade deverá ser entregue."
                />
              </label>
              <Field name="prazo" type="datetime-local" label="Prazo de entrega" required={false} />
              <p className="edu-caption">
                Ao publicar, a atividade ficará disponível para os alunos da turma. Deixe o prazo em
                branco se a entrega não tiver uma data limite.
              </p>
            </>
          ) : (
            <>
              <label className="edu-field">
                <span>Orientações para a turma</span>
                <textarea
                  className="input"
                  name="texto"
                  rows={4}
                  maxLength={20000}
                  placeholder="Apresente o material e conte como ele pode ajudar nos estudos."
                />
              </label>
              <label className="edu-upload">
                <strong>
                  <FilePlus2 size={18} className="inline mr-2" />
                  Adicionar um arquivo
                </strong>
                <span>PDF, JPG ou PNG · até 10 MB</span>
                <input
                  name="arquivo"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={(event) => setFileName(event.target.files?.[0]?.name ?? '')}
                />
                {fileName && <span>{fileName}</span>}
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="edu-alert edu-alert-error">
              {error}
            </p>
          )}
          <div className="edu-button-row">
            <button type="button" disabled={busy} className="edu-btn edu-btn-quiet" onClick={close}>
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="edu-btn edu-btn-primary">
              <Send size={16} />
              {busy
                ? 'Publicando...'
                : kind === 'aula'
                  ? 'Agendar aula'
                  : kind === 'atividade'
                    ? 'Publicar atividade'
                    : 'Publicar material'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
