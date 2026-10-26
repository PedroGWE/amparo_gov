import { type CSSProperties, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Check, ClipboardCopy, ExternalLink, Palette, Send } from 'lucide-react'
import api from '@/lib/api'
import {
  courseVisuals,
  getCourseVisual,
  invitationPath,
  type InvitationRole,
} from './course-visual'

type Course = {
  id: string
  nome: string
  tipo: 'CURSO' | 'MODALIDADE'
  tema_visual?: string | null
  ativo: boolean
  inscricoes_abertas: boolean
  turmas: { id: string; nome: string }[]
}
export function CourseInvitations({
  course,
  tenant,
  compact = false,
  onSaved,
  copyLink,
}: {
  course: Course
  tenant: string
  compact?: boolean
  onSaved: () => Promise<unknown>
  copyLink: (path: string) => Promise<unknown>
}) {
  const [preset, setPreset] = useState(course.tema_visual ?? 'AUTO')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [origin, setOrigin] = useState('')
  useEffect(() => setPreset(course.tema_visual ?? 'AUTO'), [course.tema_visual])
  useEffect(() => setOrigin(window.location.origin), [])
  const visual = getCourseVisual(course.nome, preset)
  const path = invitationPath(tenant, course.id)
  const open = course.ativo && course.inscricoes_abertas
  async function save() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api.patch(`/enrollment-admin/courses/${course.id}`, {
        nome: course.nome,
        tipo: course.tipo,
        tema_visual: preset,
      })
      await onSaved()
      setMessage('Identidade visual do convite salva.')
    } catch {
      setError('Não foi possível salvar a identidade visual. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }
  const roles: { value: InvitationRole; title: string; description: string }[] = [
    {
      value: 'ALUNO',
      title: 'Convite para o aluno',
      description: 'Abre a inscrição com a opção de o aluno preencher seus próprios dados.',
    },
    {
      value: 'RESPONSAVEL',
      title: 'Convite para o responsável',
      description: 'Abre o formulário para mãe, pai ou responsável inscrever o aluno.',
    },
  ]
  return (
    <section
      className="invite-admin space-y-5"
      style={
        {
          '--invite-accent': visual.color,
          '--invite-deep': visual.deep,
          '--invite-pale': visual.pale,
        } as CSSProperties
      }
    >
      <div className="card space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">
              {compact ? 'Link de matrícula' : 'Convites da atividade'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Uma página com a imagem e a identidade de {course.nome}, mostrando somente as turmas
              desta atividade.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${open ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}
          >
            {open ? 'Inscrições abertas' : 'Inscrições encerradas'}
          </span>
        </div>
        <div className="invite-admin-preview">
          <div>
            <span>
              {course.tipo === 'CURSO' ? 'CONVITE PARA APRENDER' : 'CONVITE PARA PARTICIPAR'}
            </span>
            <h3>{course.nome}</h3>
            <p>{visual.headline}</p>
          </div>
          <figure>
            <Image
              src={visual.src}
              alt={visual.alt}
              fill
              sizes="(max-width: 560px) 100vw, 500px"
              quality={75}
            />
          </figure>
        </div>
        {!course.turmas.length && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Crie as turmas e defina as vagas para começar a receber matrículas.
          </p>
        )}
        {!open && (
          <p className="text-sm text-amber-800">
            As inscrições estão encerradas. Reabra em Editar atividade para receber novas
            inscrições.
          </p>
        )}
        {!compact && (
          <div className="rounded-xl border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700">
              <Palette size={16} className="mb-1 mr-1 inline" />
              Imagem e cores do convite
              <select
                className="input mt-2 w-full"
                value={preset}
                disabled={busy}
                onChange={(event) => {
                  setPreset(event.target.value)
                  setMessage('')
                  setError('')
                }}
              >
                <option value="AUTO">Automático pelo nome da atividade</option>
                {Object.entries(courseVisuals).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                {preset === 'AUTO'
                  ? `Identidade identificada: ${visual.label}.`
                  : 'A imagem e as cores escolhidas serão usadas no convite público.'}
              </p>
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-2"
                disabled={busy || preset === (course.tema_visual ?? 'AUTO')}
                onClick={() => void save()}
              >
                <Check size={15} />
                {busy ? 'Salvando...' : 'Salvar identidade'}
              </button>
            </div>
            {message && (
              <p className="mt-3 text-sm text-emerald-700" role="status">
                {message}
              </p>
            )}
            {error && (
              <p className="mt-3 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
        <div>
          <p className="mb-2 text-xs font-medium text-gray-500">
            Link geral · quem abre escolhe como preencher
          </p>
          <code className="block break-all rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            {origin}
            {path}
          </code>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            onClick={() => void copyLink(path)}
          >
            <ClipboardCopy size={16} />
            Copiar link de matrícula
          </button>
          <Link href={path} target="_blank" className="btn-ghost inline-flex items-center gap-2">
            <ExternalLink size={15} />
            Abrir formulário
          </Link>
          {compact && (
            <Link
              href={`/${tenant}/cursos/${course.id}?aba=convites`}
              shallow
              className="text-sm font-medium text-brand-700"
            >
              Personalizar e compartilhar convites
            </Link>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Turmas lotadas continuam recebendo inscrições na reserva, por ordem de inscrição.
        </p>
      </div>
      {!compact && (
        <>
          <div>
            <h3 className="font-semibold text-gray-900">Compartilhe para quem vai preencher</h3>
            <p className="mt-1 text-sm text-gray-500">
              O curso já vem definido. A pessoa pode conferir e ajustar quem está preenchendo.
            </p>
          </div>
          <div className="invite-share-grid">
            {roles.map((role) => {
              const rolePath = invitationPath(tenant, course.id, { role: role.value })
              return (
                <article key={role.value} className="invite-share-card">
                  <h3>{role.title}</h3>
                  <p>{role.description}</p>
                  <code>
                    {origin}
                    {rolePath}
                  </code>
                  <button
                    type="button"
                    className="invite-btn invite-btn-primary"
                    onClick={() => void copyLink(rolePath)}
                  >
                    <ClipboardCopy size={15} />
                    Copiar convite
                  </button>
                  <div className="invite-share-actions">
                    <Link href={rolePath} target="_blank">
                      Visualizar
                    </Link>
                    {origin && (
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`Convite para ${course.nome}. ${role.description} ${origin}${rolePath}`)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Send size={12} className="mr-1 inline" />
                        WhatsApp
                      </a>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
          {course.turmas.length > 0 && (
            <div className="card space-y-4">
              <h3 className="font-semibold text-gray-900">Convite direto para uma turma</h3>
              <p className="text-sm text-gray-500">
                A mesma identidade visual, com a turma selecionada no formulário.
              </p>
              {course.turmas.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3"
                >
                  <strong className="text-sm font-medium">{item.nome}</strong>
                  <div className="flex gap-4 text-xs font-medium text-brand-700">
                    <button
                      type="button"
                      onClick={() =>
                        void copyLink(invitationPath(tenant, course.id, { classId: item.id }))
                      }
                    >
                      Copiar link da turma
                    </button>
                    <Link
                      href={invitationPath(tenant, course.id, { classId: item.id })}
                      target="_blank"
                    >
                      Visualizar
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
