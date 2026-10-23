import Link from 'next/link'
import type { ProjectDetails } from '@/services/projects'
import { formatCurrency } from './project-utils'

export function ProjectFundingPanel({ project, tenant }: { project: ProjectDetails; tenant: string }) {
  const instruments = Array.isArray(project.funding_sources) ? project.funding_sources.filter(item => item?.instrument) : []
  if (!project.cursos?.length && !instruments.length && !project.emendas?.length && !project.editais?.length) return null
  return <section className="card space-y-5">
    <h2 className="font-semibold text-gray-900">Modalidades e instrumentos vinculados</h2>
    {!!project.cursos?.length && <div className="flex flex-wrap gap-2">{project.cursos.map(course => <Link key={course.id} href={`/${tenant}/cursos/${encodeURIComponent(course.id)}`} className="rounded-full bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100">{course.nome}</Link>)}</div>}
    {instruments.map((item, index) => <div key={index} className="rounded-lg border border-gray-200 p-4 text-sm text-gray-600"><h3 className="font-semibold text-gray-900">Termo de fomento {item.instrument}</h3><p className="mt-2">{item.official_status}</p><p className="mt-1">Proposta: {item.proposal || '—'} · Processo: {item.process || '—'}</p><p className="mt-1">Valor liberado: {formatCurrency(item.released_amount)} · Contrapartida financeira: {formatCurrency(item.counterpart_amount)}</p>{item.reference_date && <p className="mt-1 text-xs text-gray-500">Fonte: relatório fornecido · Referência: {new Date(item.reference_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>}{item.official_url && <a href={item.official_url} target="_blank" rel="noreferrer" className="mt-2 inline-block font-medium text-brand-700 hover:underline">Consultar instrumento no Portal da Transparência</a>}{item.document_urls?.length ? <div className="mt-3 flex flex-wrap gap-3">{item.document_urls.map(document => <a key={document.url} href={document.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-700 hover:underline">{document.title}</a>)}</div> : null}</div>)}
    {!!project.emendas?.length && <div><h3 className="mb-2 text-sm font-semibold text-gray-900">Emendas</h3>{project.emendas.map(item => <p key={item.id} className="py-1 text-sm text-gray-600">{item.number}/{item.year} · {item.parlamentar_name} · {formatCurrency(item.value)}</p>)}</div>}
    {!!project.editais?.length && <div><h3 className="mb-2 text-sm font-semibold text-gray-900">Licitações e editais</h3><div className="space-y-2">{project.editais.map(item => item.link_oficial ? <a key={item.id} href={item.link_oficial} target="_blank" rel="noreferrer" className="block text-sm text-brand-700 hover:underline">{item.titulo}</a> : <p key={item.id} className="text-sm text-gray-600">{item.titulo}</p>)}</div></div>}
  </section>
}
