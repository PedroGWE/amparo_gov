import { FormEvent, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Image from 'next/image'
import useSWR from 'swr'
import axios from 'axios'
import {
  ArrowLeft,
  ArrowRight,
  Link2,
  GraduationCap,
  Plus,
  Users,
  LayoutDashboard,
  School,
  ClipboardList,
  FolderKanban,
  Settings2,
  RefreshCw,
} from 'lucide-react'
import Head from 'next/head'
import { EnrollmentManagement } from '@/components/courses/EnrollmentManagement'
import { Modal } from '@/components/ui/Modal'
import api from '@/lib/api'
import { CourseStudents } from '@/components/courses/CourseStudents'
import { CourseInvitations } from './CourseInvitations'
import { getCourseVisual, invitationPath } from './course-visual'

type Project = {
  id: string
  name: string
  code: string | null
  total_budget: string | null
  emendas?: Amendment[]
  editais?: Notice[]
}
type Amendment = {
  id: string
  number: string | null
  year: number
  parlamentar_name: string
  value: string
}
type Notice = {
  id: string
  titulo: string
  descricao: string | null
  valor_total: string | null
  link_oficial: string | null
  data_encerramento: string | null
}
type Class = {
  id: string
  nome: string
  capacidade: number | null
  inscritos: number
  espera: number
  vagas: number | null
}
type Course = {
  tema_visual?: string | null
  id: string
  nome: string
  tipo: 'CURSO' | 'MODALIDADE'
  descricao: string | null
  ativo: boolean
  inscricoes_abertas: boolean
  projetos: Project[]
  emendas: Amendment[]
  editais: Notice[]
  turmas: Class[]
  total_alunos: number
}
type Options = { projects: Project[]; emendas: Amendment[]; editais: Notice[] }
type CourseForm = {
  nome: string
  tipo: 'CURSO' | 'MODALIDADE'
  descricao: string
  ativo: boolean
  inscricoes_abertas: boolean
  project_ids: string[]
  emenda_ids: string[]
  edital_ids: string[]
}
const emptyForm: CourseForm = {
  nome: '',
  tipo: 'MODALIDADE',
  descricao: '',
  ativo: true,
  inscricoes_abertas: true,
  project_ids: [],
  emenda_ids: [],
  edital_ids: [],
}
const money = (value: string | number | null) =>
  Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const unique = <T extends { id: string }>(items: T[]) =>
  Array.from(new Map(items.map((item) => [item.id, item])).values())
function errorMessage(error: unknown) {
  const message = axios.isAxiosError(error) ? error.response?.data?.message : undefined
  return Array.isArray(message)
    ? message.join('. ')
    : typeof message === 'string'
      ? message
      : 'Não foi possível concluir a operação.'
}

const sections = [
  { id: 'resumo', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'alunos', label: 'Alunos', icon: Users },
  { id: 'turmas', label: 'Turmas e vagas', icon: School },
  { id: 'matriculas', label: 'Matrículas e reserva', icon: ClipboardList },
  { id: 'convites', label: 'Convites', icon: Link2 },
  { id: 'recursos', label: 'Projetos e recursos', icon: FolderKanban },
  { id: 'dados', label: 'Dados da atividade', icon: Settings2 },
] as const

export default function CoursesManager({ courseId }: { courseId?: string }) {
  const router = useRouter()
  const tenant = typeof router.query.tenant === 'string' ? router.query.tenant : ''
  const courseUrl = courseId ? `/enrollment-admin/courses/${courseId}` : '/enrollment-admin/courses'
  const {
    data: courseData,
    error: loadError,
    mutate,
    isValidating,
  } = useSWR(courseUrl, () => api.get(courseUrl).then((r) => r.data as Course | Course[]), {
    refreshInterval: 15000,
  })
  const courses = Array.isArray(courseData) ? courseData : courseData ? [courseData] : undefined
  const { data: options, error: optionsError } = useSWR('/enrollment-admin/courses/options', () =>
    api.get('/enrollment-admin/courses/options').then((r) => r.data as Options),
  )
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [modal, setModal] = useState<'course' | 'classes' | 'capacity' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CourseForm>(emptyForm)
  const [classForm, setClassForm] = useState({
    nome: '',
    quantidade: '1',
    capacidade: '30',
    project_id: '',
  })
  const [editingClass, setEditingClass] = useState<Class | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const visible = courses?.filter(
    (c) =>
      (!filter || c.tipo === filter) &&
      c.nome.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')),
  )
  const selected = courseId ? courses?.find((course) => course.id === courseId) : undefined
  const activeSection = sections.find((section) => section.id === router.query.aba)?.id ?? 'resumo'
  const sectionPath = (id: string) => `/${tenant}/cursos/${courseId}?aba=${id}`
  const activeStudents = selected?.turmas.reduce((n, turma) => n + turma.inscritos, 0) ?? 0
  const reserve = selected?.turmas.reduce((n, turma) => n + turma.espera, 0) ?? 0
  const vacancies = selected?.turmas.reduce((n, turma) => n + (turma.vagas ?? 0), 0) ?? 0
  const amendments = selected
    ? unique([...selected.emendas, ...selected.projetos.flatMap((p) => p.emendas ?? [])])
    : []
  const notices = selected
    ? unique([...selected.editais, ...selected.projetos.flatMap((p) => p.editais ?? [])])
    : []
  const enrollmentPath =
    selected && tenant ? invitationPath(tenant, selected.id) : ''

  function openCourse(course?: Course) {
    setEditingId(course?.id ?? null)
    setForm(
      course
        ? {
            nome: course.nome,
            tipo: course.tipo,
            descricao: course.descricao ?? '',
            ativo: course.ativo,
            inscricoes_abertas: course.inscricoes_abertas,
            project_ids: course.projetos.map((p) => p.id),
            emenda_ids: course.emendas.map((e) => e.id),
            edital_ids: course.editais.map((e) => e.id),
          }
        : { ...emptyForm },
    )
    setError('')
    setModal('course')
  }
  function toggle(field: 'project_ids' | 'emenda_ids' | 'edital_ids', id: string) {
    setForm((current) => ({
      ...current,
      [field]: current[field].includes(id)
        ? current[field].filter((value) => value !== id)
        : [...current[field], id],
    }))
  }
  async function saveCourse(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { data } = editingId
        ? await api.patch(`/enrollment-admin/courses/${editingId}`, form)
        : await api.post('/enrollment-admin/courses', form)
      setModal(null)
      setMessage('Curso ou modalidade salvo.')
      await mutate()
      if (!editingId) await router.push(`/${tenant}/cursos/${encodeURIComponent(data.id)}`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }
  async function saveClasses(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      if (modal === 'capacity' && editingClass) {
        const { data } = await api.patch(`/enrollment-admin/classes/${editingClass.id}`, {
          nome: classForm.nome.trim(),
          capacidade: Number(classForm.capacidade),
        })
        setMessage(
          data.promoted
            ? `Turma atualizada. ${data.promoted} aluno(s) da reserva receberam vaga.`
            : 'Turma atualizada.',
        )
      } else {
        await api.post(`/enrollment-admin/courses/${selected.id}/classes`, {
          ...classForm,
          nome: classForm.nome.trim(),
          quantidade: Number(classForm.quantidade),
          capacidade: Number(classForm.capacidade),
          project_id: classForm.project_id || undefined,
        })
        setMessage('Turmas criadas. O link de matrícula está pronto para compartilhar.')
      }
      setModal(null)
      await mutate()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }
  async function copyLink(path: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      setMessage('Link de matrícula copiado.')
      setError('')
    } catch {
      setError('Não foi possível copiar. Abra o formulário e copie o endereço do navegador.')
    }
  }

  return (
    <div className="space-y-6">
      <Head>
        <title>
          {(selected ? selected.nome + ' | Gestão da atividade' : 'Cursos e modalidades') +
            ' | Amparo GOV'}
        </title>
      </Head>
      {!courseId && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Cursos e modalidades</h1>
              <p className="mt-1 text-sm text-gray-500">
                Selecione uma atividade para abrir sua área de gestão.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openCourse()}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Novo curso ou modalidade
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card">
              <p className="text-sm text-gray-500">Atividades</p>
              <p className="mt-1 text-2xl font-semibold">{courses?.length ?? '—'}</p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-500">Turmas</p>
              <p className="mt-1 text-2xl font-semibold">
                {courses?.reduce((n, course) => n + course.turmas.length, 0) ?? '—'}
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-500">Inscrições abertas</p>
              <p className="mt-1 text-2xl font-semibold">
                {courses?.filter((course) => course.ativo && course.inscricoes_abertas).length ??
                  '—'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <input
              className="input min-w-0 flex-1"
              aria-label="Buscar curso ou modalidade"
              placeholder="Buscar curso ou modalidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="input"
              aria-label="Tipo de atividade"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">Todos os tipos</option>
              <option value="CURSO">Cursos</option>
              <option value="MODALIDADE">Modalidades</option>
            </select>
          </div>
        </>
      )}
      {courseId && (
        <Link
          href={`/${tenant}/cursos`}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" /> Todos os cursos e modalidades
        </Link>
      )}
      {message && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && !modal && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {loadError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {axios.isAxiosError(loadError) && loadError.response?.status === 404
            ? 'Curso ou modalidade não encontrado.'
            : 'Não foi possível carregar os dados da atividade.'}{' '}
          <button type="button" className="underline" onClick={() => mutate()}>
            Tentar novamente
          </button>
        </p>
      )}
      {!courses && !loadError && (
        <p role="status" className="text-sm text-gray-500">
          Carregando {courseId ? 'atividade' : 'cursos e modalidades'}...
        </p>
      )}
      {!courseId && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible?.length === 0 && (
            <p className="text-sm text-gray-500">Nenhum curso ou modalidade encontrado.</p>
          )}
          {visible?.map((course) => (
            <Link
              key={course.id}
              href={`/${tenant}/cursos/${encodeURIComponent(course.id)}`}
              className="card group block space-y-4 transition hover:border-brand-300 hover:shadow-md"
            >
              <div className="invite-admin-thumb">
                <Image
                  src={getCourseVisual(course.nome, course.tema_visual).src}
                  alt={getCourseVisual(course.nome, course.tema_visual).alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 360px"
                  quality={65}
                />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="rounded-xl bg-brand-50 p-3">
                    <GraduationCap className="h-6 w-6 text-brand-600" />
                  </span>
                  <div>
                    <p className="text-xs text-gray-500">
                      {course.tipo === 'CURSO' ? 'Curso' : 'Modalidade'}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-gray-900 group-hover:text-brand-700">
                      {course.nome}
                    </h2>
                  </div>
                </div>
                <ArrowRight className="mt-3 h-5 w-5 shrink-0 text-gray-400 group-hover:text-brand-700" />
              </div>
              <p className="text-xs font-medium text-gray-600">
                {!course.ativo
                  ? 'Inativo'
                  : course.inscricoes_abertas
                    ? 'Inscrições abertas'
                    : 'Inscrições encerradas'}
              </p>
              <div className="flex flex-wrap gap-4 border-t border-gray-100 pt-3 text-sm text-gray-600">
                <span>{course.total_alunos ?? 0} alunos</span>
                <span>{course.turmas.length} turmas</span>
                <span>{course.projetos.length} projetos</span>
              </div>
              <span className="inline-block text-sm font-medium text-brand-700">Abrir gestão</span>
            </Link>
          ))}
        </div>
      )}
      {selected && (
        <>
          <header className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-brand-50 p-3">
                  <GraduationCap className="h-7 w-7 text-brand-600" />
                </span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
                    {selected.tipo === 'CURSO' ? 'Gestão do curso' : 'Gestão da modalidade'}
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold text-gray-900">{selected.nome}</h1>
                  <p className="mt-2 text-sm text-gray-500">
                    {!selected.ativo
                      ? 'Atividade inativa'
                      : selected.inscricoes_abertas
                        ? 'Inscrições abertas'
                        : 'Inscrições encerradas'}{' '}
                    · {selected.total_alunos ?? 0} alunos vinculados · {selected.turmas.length}{' '}
                    turmas
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary inline-flex items-center gap-2"
                  disabled={isValidating}
                  onClick={() => mutate()}
                >
                  <RefreshCw className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />{' '}
                  Atualizar
                </button>
                <button
                  type="button"
                  className="btn-primary inline-flex items-center gap-2"
                  onClick={() => openCourse(selected)}
                >
                  <Settings2 className="h-4 w-4" /> Editar atividade
                </button>
              </div>
            </div>
            <nav
              aria-label="Seções da atividade"
              className="flex flex-wrap gap-1 border-t border-gray-100 bg-gray-50/70 p-2 sm:px-4"
            >
              {sections.map(({ id, label, icon: Icon }) => (
                <Link
                  key={id}
                  href={sectionPath(id)}
                  shallow
                  scroll={false}
                  aria-current={activeSection === id ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${activeSection === id ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white hover:text-brand-800'}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              ))}
            </nav>
          </header>
          {activeSection === 'resumo' && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: 'Alunos vinculados',
                    value: selected.total_alunos ?? 0,
                    detail: 'Participantes desta atividade',
                    section: 'alunos',
                  },
                  {
                    label: 'Turmas',
                    value: selected.turmas.length,
                    detail: activeStudents + ' matrículas ativas',
                    section: 'turmas',
                  },
                  {
                    label: 'Vagas disponíveis',
                    value: vacancies,
                    detail: 'Conforme a capacidade das turmas',
                    section: 'turmas',
                  },
                  {
                    label: 'Lista de reserva',
                    value: reserve,
                    detail: 'Promoção por ordem de inscrição',
                    section: 'matriculas',
                  },
                ].map((item) => (
                  <Link
                    key={item.label}
                    href={sectionPath(item.section)}
                    shallow
                    className="card block hover:border-brand-200"
                  >
                    <p className="text-sm text-gray-500">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-gray-900">{item.value}</p>
                    <p className="mt-1 text-xs text-gray-500">{item.detail}</p>
                  </Link>
                ))}
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <section className="card space-y-3">
                  <h2 className="font-semibold text-gray-900">Sobre a atividade</h2>
                  <p className="whitespace-pre-line text-sm text-gray-600">
                    {selected.descricao ||
                      'Adicione os objetivos e as informações da atividade em Dados da atividade.'}
                  </p>
                  <p className="text-sm text-gray-600">
                    {selected.projetos.length} projetos · {amendments.length} emendas ·{' '}
                    {notices.length} editais vinculados
                  </p>
                  <Link
                    href={sectionPath('recursos')}
                    shallow
                    className="inline-block text-sm font-medium text-brand-700"
                  >
                    Ver projetos e recursos
                  </Link>
                </section>
                <section className="card space-y-3">
                  <h2 className="font-semibold text-gray-900">Gestão de alunos e turmas</h2>
                  <p className="text-sm text-gray-600">
                    Acompanhe os participantes, defina turmas e vagas e consulte matrículas e
                    reserva nas seções desta atividade.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Link href={sectionPath('alunos')} shallow className="btn-ghost">
                      Gerenciar alunos
                    </Link>
                    <Link href={sectionPath('turmas')} shallow className="btn-primary">
                      Gerenciar turmas
                    </Link>
                  </div>
                </section>
              </div>
              <CourseInvitations
                course={selected}
                tenant={tenant}
                compact
                onSaved={mutate}
                copyLink={copyLink}
              />
            </div>
          )}
          {activeSection === 'convites' && (
            <CourseInvitations
              key={selected.id}
              course={selected}
              tenant={tenant}
              onSaved={mutate}
              copyLink={copyLink}
            />
          )}
          {activeSection === 'alunos' && (
            <CourseStudents
              key={selected.id}
              courseId={selected.id}
              tenant={tenant}
              total={selected.total_alunos ?? 0}
              onLinked={mutate}
            />
          )}
          {activeSection === 'turmas' && (
            <section className="card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-2 font-semibold text-gray-900">
                  <Users className="h-5 w-5 text-brand-600" /> Turmas e vagas
                </h3>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setClassForm({
                      nome: `${selected.nome} - Turma`,
                      quantidade: '1',
                      capacidade: '30',
                      project_id: '',
                    })
                    setError('')
                    setModal('classes')
                  }}
                >
                  Criar turmas
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Ao ampliar a capacidade ou encerrar uma matrícula, os primeiros da reserva recebem
                as vagas automaticamente.
              </p>
              {selected.turmas.length === 0 && (
                <p className="text-sm text-gray-500">
                  Nenhuma turma vinculada. Para vincular uma turma existente, edite-a na aba
                  Matrículas.
                </p>
              )}
              {selected.turmas.map((turma) => (
                <div key={turma.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h4 className="font-medium text-gray-900">{turma.nome}</h4>
                    <button
                      type="button"
                      className="text-sm font-medium text-brand-700"
                      onClick={() => {
                        setEditingClass(turma)
                        setClassForm({
                          nome: turma.nome,
                          quantidade: '1',
                          capacidade: String(turma.capacidade ?? 30),
                          project_id: '',
                        })
                        setError('')
                        setModal('capacity')
                      }}
                    >
                      Editar vagas
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {turma.inscritos}/{turma.capacidade ?? '—'} matriculados · {turma.espera} na
                    reserva · {turma.vagas ?? '—'} vagas
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    <Link
                      href={`/${tenant}/cursos/${courseId}?aba=matriculas&turma=${encodeURIComponent(turma.id)}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      Ver alunos e reserva
                    </Link>
                    <button
                      type="button"
                      className="font-medium text-brand-700 hover:underline"
                      onClick={() =>
                        copyLink(invitationPath(tenant, selected.id, { classId: turma.id }))
                      }
                    >
                      Copiar link desta turma
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
          {activeSection === 'matriculas' && (
            <EnrollmentManagement
              key={selected.id}
              scopeCourseId={selected.id}
              scopeCourseName={selected.nome}
            />
          )}
          {activeSection === 'recursos' && (
            <div className="space-y-5">
              <section className="card space-y-3">
                <h3 className="font-semibold text-gray-900">
                  Projetos vinculados ({selected.projetos.length})
                </h3>
                {!selected.projetos.length && (
                  <p className="text-sm text-gray-500">Nenhum projeto vinculado.</p>
                )}
                {selected.projetos.map((project) => (
                  <Link
                    href={`/${tenant}/projetos/${project.id}`}
                    key={project.id}
                    className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
                  >
                    <p className="font-medium text-brand-700">{project.name}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {project.code || 'Sem código'} · Orçamento do projeto:{' '}
                      {money(project.total_budget)}
                    </p>
                  </Link>
                ))}
                <p className="text-xs text-gray-500">
                  Um projeto pode atender mais de uma modalidade. Seu orçamento é compartilhado
                  entre elas.
                </p>
              </section>
              <section className="card space-y-3">
                <h3 className="font-semibold text-gray-900">
                  Emendas vinculadas ({amendments.length})
                </h3>
                {!amendments.length && (
                  <p className="text-sm text-gray-500">Nenhuma emenda identificada ou vinculada.</p>
                )}
                {amendments.map((emenda) => (
                  <div key={emenda.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                    <p className="font-medium text-gray-900">
                      {emenda.number || 'Sem número'}/{emenda.year} · {emenda.parlamentar_name}
                    </p>
                    <p className="mt-1 text-gray-600">{money(emenda.value)}</p>
                  </div>
                ))}
              </section>
              <section className="card space-y-3">
                <h3 className="font-semibold text-gray-900">
                  Licitações e editais vinculados ({notices.length})
                </h3>
                <p className="text-xs text-gray-500">
                  Inclui os editais dos projetos vinculados. Valores de editais e versões não são
                  somados ao orçamento do projeto.
                </p>
                {!notices.length && (
                  <p className="text-sm text-gray-500">
                    Nenhum edital vinculado. Cadastre na aba Editais e selecione ao editar este
                    curso.
                  </p>
                )}
                {notices.map((notice) => (
                  <div key={notice.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                    <p className="font-medium text-gray-900">{notice.titulo}</p>
                    {notice.descricao && (
                      <p className="mt-1 whitespace-pre-line text-xs text-gray-600">
                        {notice.descricao}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      Itens: {money(notice.valor_total)}
                      {notice.data_encerramento
                        ? ` · Encerramento: ${new Date(notice.data_encerramento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`
                        : ''}
                    </p>
                    {notice.link_oficial && (
                      <a
                        href={notice.link_oficial}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block font-medium text-brand-700 hover:underline"
                      >
                        Abrir documento
                      </a>
                    )}
                  </div>
                ))}
              </section>
            </div>
          )}
          {activeSection === 'dados' && (
            <section className="card space-y-3">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
                    {selected.tipo === 'CURSO' ? 'Curso' : 'Modalidade'}
                  </p>
                  <h2 className="text-xl font-semibold text-gray-900">{selected.nome}</h2>
                </div>
                <button type="button" className="btn-ghost" onClick={() => openCourse(selected)}>
                  Editar e vincular recursos
                </button>
              </div>
              {selected.descricao && (
                <p className="whitespace-pre-line text-sm text-gray-600">{selected.descricao}</p>
              )}
              <div className="flex flex-wrap gap-4 text-sm">
                <span>{selected.total_alunos ?? 0} alunos vinculados</span>
                <span>{selected.turmas.reduce((n, t) => n + t.inscritos, 0)} matriculados</span>
                <span>{selected.turmas.reduce((n, t) => n + t.espera, 0)} na reserva</span>
                <span>
                  {selected.turmas.reduce((n, t) => n + (t.vagas ?? 0), 0)} vagas disponíveis
                </span>
              </div>
            </section>
          )}
        </>
      )}
      <Modal
        open={modal === 'course'}
        onClose={() => setModal(null)}
        title={editingId ? 'Editar curso ou modalidade' : 'Novo curso ou modalidade'}
      >
        <form onSubmit={saveCourse} className="space-y-4">
          <label className="block text-sm">
            Nome *
            <input
              className="input mt-1 w-full"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              required
              minLength={2}
              maxLength={120}
            />
          </label>
          <label className="block text-sm">
            Tipo *
            <select
              className="input mt-1 w-full"
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as CourseForm['tipo'] })}
            >
              <option value="CURSO">Curso</option>
              <option value="MODALIDADE">Modalidade</option>
            </select>
          </label>
          <label className="block text-sm">
            Descrição
            <textarea
              className="input mt-1 w-full"
              rows={3}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              maxLength={5000}
            />
            <small className="mt-1 block text-xs text-gray-500">
              Esta descrição também aparece no convite público da atividade.
            </small>
          </label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              />{' '}
              Ativo
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.inscricoes_abertas}
                onChange={(e) => setForm({ ...form, inscricoes_abertas: e.target.checked })}
              />{' '}
              Inscrições abertas
            </label>
          </div>
          {optionsError && (
            <p role="alert" className="text-sm text-red-700">
              Não foi possível carregar os vínculos. Reabra esta janela após atualizar a página.
            </p>
          )}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">Projetos</legend>
            <div className="max-h-44 space-y-2 overflow-y-auto">
              {options?.projects.map((project) => (
                <label key={project.id} className="flex items-start gap-2 text-sm">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={form.project_ids.includes(project.id)}
                    onChange={() => toggle('project_ids', project.id)}
                  />
                  <span>
                    {project.name}{' '}
                    {project.code && (
                      <span className="text-xs text-gray-500">({project.code})</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">Emendas adicionais</legend>
            <p className="text-xs text-gray-500">
              As emendas dos projetos selecionados aparecem automaticamente.
            </p>
            <div className="max-h-36 space-y-2 overflow-y-auto">
              {options?.emendas.map((emenda) => (
                <label key={emenda.id} className="flex items-start gap-2 text-sm">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={form.emenda_ids.includes(emenda.id)}
                    onChange={() => toggle('emenda_ids', emenda.id)}
                  />
                  <span>
                    {emenda.number}/{emenda.year} · {emenda.parlamentar_name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">Licitações e editais adicionais</legend>
            <p className="text-xs text-gray-500">
              Os editais dos projetos selecionados aparecem automaticamente.
            </p>
            <div className="max-h-44 space-y-2 overflow-y-auto">
              {options?.editais.map((edital) => (
                <label key={edital.id} className="flex items-start gap-2 text-sm">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={form.edital_ids.includes(edital.id)}
                    onChange={() => toggle('edital_ids', edital.id)}
                  />
                  <span>{edital.titulo}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setModal(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving || !options}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={modal === 'classes' || modal === 'capacity'}
        onClose={() => setModal(null)}
        title={
          modal === 'capacity' ? 'Editar turma e vagas' : `Criar turmas · ${selected?.nome ?? ''}`
        }
      >
        <form onSubmit={saveClasses} className="space-y-4">
          <label className="block text-sm">
            Nome da turma *
            <input
              className="input mt-1 w-full"
              value={classForm.nome}
              onChange={(e) => setClassForm({ ...classForm, nome: e.target.value })}
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          {modal === 'classes' && (
            <>
              <label className="block text-sm">
                Quantidade de turmas *
                <input
                  className="input mt-1 w-full"
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  required
                  value={classForm.quantidade}
                  onChange={(e) => setClassForm({ ...classForm, quantidade: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Projeto da turma
                <select
                  className="input mt-1 w-full"
                  value={classForm.project_id}
                  onChange={(e) => setClassForm({ ...classForm, project_id: e.target.value })}
                >
                  <option value="">Sem projeto definido</option>
                  {selected?.projetos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="block text-sm">
            Vagas por turma *
            <input
              className="input mt-1 w-full"
              type="number"
              min={1}
              max={10000}
              step={1}
              required
              value={classForm.capacidade}
              onChange={(e) => setClassForm({ ...classForm, capacidade: e.target.value })}
            />
          </label>
          <p className="text-sm text-gray-600">
            Ao esgotar as vagas, as novas inscrições entram na reserva.{' '}
            {modal === 'classes' &&
              `Total a criar: ${Number(classForm.quantidade) * Number(classForm.capacidade)} vagas.`}
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setModal(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : modal === 'capacity' ? 'Salvar vagas' : 'Criar turmas'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
