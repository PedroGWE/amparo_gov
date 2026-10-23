import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import axios from 'axios'
import { Modal } from '@/components/ui/Modal'
import api from '@/lib/api'

type CourseStudent = { id: string; name: string; status: string; matriculas: { status: string; turma: { id: string; nome: string } }[] }
type StudentOption = { id: string; name: string; cursos?: { id: string }[] }

export function CourseStudents({ courseId, tenant, total, onLinked }: { courseId: string; tenant: string; total: number; onLinked: () => Promise<unknown> }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [optionSearch, setOptionSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [studentId, setStudentId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const { data, error: loadError, mutate } = useSWR(`/enrollment-admin/courses/${courseId}/students`, () => api.get(`/enrollment-admin/courses/${courseId}/students`).then(r => r.data as CourseStudent[]), { refreshInterval: 15000 })
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(optionSearch), 250); return () => clearTimeout(timer) }, [optionSearch])
  const { data: options, error: optionsError } = useSWR(open ? ['course-student-options', debouncedSearch] : null, () => api.get('/beneficiarios', { params: { search: debouncedSearch || undefined, limit: 50 } }).then(r => r.data as { data: StudentOption[]; total: number }))
  const visible = data?.filter(student => student.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  async function linkStudent(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await api.post(`/enrollment-admin/courses/${courseId}/students/${encodeURIComponent(studentId)}`)
      setOpen(false); setMessage('Aluno vinculado ao curso ou modalidade.'); await Promise.all([mutate(), onLinked()])
    } catch (caught) {
      const value = axios.isAxiosError(caught) ? caught.response?.data?.message : undefined
      setError(typeof value === 'string' ? value : 'Não foi possível vincular o aluno.')
    } finally { setSaving(false) }
  }
  return <section className="card space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-gray-900">Alunos vinculados ({data?.length ?? total})</h3><button type="button" className="btn-ghost" onClick={() => { setStudentId(''); setOptionSearch(''); setError(''); setOpen(true) }}>Vincular aluno existente</button></div>
    <p className="text-sm text-gray-600">Os vínculos anteriores foram preservados. O aluno pode participar de várias atividades. A turma é definida separadamente, conforme as vagas.</p>
    {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    <input className="input w-full" aria-label="Buscar aluno vinculado" placeholder="Buscar aluno nesta modalidade..." value={search} onChange={event => setSearch(event.target.value)} />
    {loadError && <p role="alert" className="text-sm text-red-700">Não foi possível carregar os alunos. <button type="button" className="underline" onClick={() => mutate()}>Tentar novamente</button></p>}
    {!data && !loadError && <p className="text-sm text-gray-500">Carregando alunos vinculados...</p>}
    {data && !visible?.length && <p className="text-sm text-gray-500">{search ? 'Nenhum aluno corresponde à busca.' : 'Nenhum aluno vinculado a esta atividade.'}</p>}
    <div className="max-h-[32rem] space-y-2 overflow-y-auto">{visible?.map(student => <div key={student.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-3"><div className="min-w-0"><Link href={`/${tenant}/beneficiarios?aluno=${encodeURIComponent(student.id)}`} className="font-medium text-brand-700 hover:underline">{student.name}</Link><p className="mt-1 text-xs text-gray-500">{student.status === 'ATIVO' ? 'Ativo' : student.status === 'INATIVO' ? 'Inativo' : student.status}{student.matriculas.length === 0 ? ' · Sem turma definida nesta atividade' : ''}</p><div className="mt-1 space-y-1">{student.matriculas.map(item => <Link key={item.turma.id} href={`/${tenant}/cursos/${courseId}?aba=matriculas&turma=${encodeURIComponent(item.turma.id)}`} className="block text-xs text-gray-600 hover:text-brand-700">{item.turma.nome} · {item.status === 'EM_ESPERA' ? 'Reserva' : 'Matriculado'}</Link>)}</div></div></div>)}</div>
    <Link href={`/${tenant}/beneficiarios?curso=${encodeURIComponent(courseId)}`} className="inline-block text-sm font-medium text-brand-700 hover:underline">Abrir beneficiários desta atividade</Link>
    <Modal open={open} onClose={() => setOpen(false)} title="Vincular aluno existente"><form onSubmit={linkStudent} className="space-y-4"><label className="block text-sm">Buscar beneficiário<input className="input mt-1 w-full" value={optionSearch} onChange={event => { setOptionSearch(event.target.value); setStudentId('') }} placeholder="Digite o nome do aluno..." /></label>{optionsError && <p role="alert" className="text-sm text-red-700">Não foi possível carregar os beneficiários.</p>}<label className="block text-sm">Aluno *<select className="input mt-1 w-full" required value={studentId} onChange={event => setStudentId(event.target.value)}><option value="">Selecione o aluno</option>{options?.data.map(student => <option key={student.id} value={student.id} disabled={student.cursos?.some(course => course.id === courseId)}>{student.name}{student.cursos?.some(course => course.id === courseId) ? ' — já vinculado' : ''}</option>)}</select></label>{options && options.total > 50 && <p className="text-xs text-gray-500">Exibindo 50 resultados. Digite o nome para encontrar os demais.</p>}<p className="text-xs text-gray-500">Este vínculo identifica a atividade do aluno. Ele preserva as matrículas e as vagas das turmas.</p>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button type="submit" className="btn-primary" disabled={saving || !studentId}>{saving ? 'Vinculando...' : 'Vincular aluno'}</button></div></form></Modal>
  </section>
}
