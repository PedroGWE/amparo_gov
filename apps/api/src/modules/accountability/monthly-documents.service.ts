import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import ExcelJS from 'exceljs'
import archiver from 'archiver'
import { PassThrough } from 'node:stream'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../documents/storage/storage.service'
import { MonthlyService } from './monthly.service'
import { csvCell, monthBounds } from './monthly-rules'

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const text = (value: unknown) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/[^\u0020-\u00ff]/g, '?')

@Injectable()
export class MonthlyDocumentsService {
  constructor(private db: PrismaService, private storage: StorageService, private monthly: MonthlyService) {}

  private async lines(kind: string, view: Awaited<ReturnType<MonthlyService['overview']>>, teamId?: string, classId?: string) {
    const month = view.month.month.toISOString().slice(0, 7)
    const header = [`Projeto: ${view.month.project_id}`, `Instrumento: ${view.month.instrument.number}`, `Competência: ${month}`, `Revisão: ${view.month.revision}`]
    if (kind === 'PRESENCA') return [...header, ...view.attendance.filter(t => !classId || t.id === classId).flatMap(t => [
      `Turma: ${t.nome} | Modalidade: ${t.modalidade ?? 'não informada'}`,
      `Aulas: ${t.aulas.map(a => a.inicio.toISOString().slice(0, 10)).join(', ') || 'nenhuma registrada'}`,
      ...t.beneficiarios.map(b => `${b.nome} | ${b.records.map(r => r.status).join(' / ')} | ${b.percent === null ? 'conferência pendente' : `${b.percent}%`}`),
      'Assinatura do responsável: __________________________',
    ])]
    if (kind === 'PONTO') {
      const team = view.team.find(t => t.id === teamId)
      if (!team) throw new NotFoundException('Profissional não encontrado nesta competência')
      const { days } = monthBounds(month)
      const records = view.month.point_entries.filter(e => e.team_link_id === team.id)
      return [...header, `Profissional: ${team.name} | Função: ${team.role}`, `Vigência: ${team.valid_from.toISOString().slice(0, 10)} a ${team.valid_until?.toISOString().slice(0, 10) ?? 'vigente'}`,
        ...Array.from({ length: days }, (_, i) => {
          const day = `${month}-${String(i + 1).padStart(2, '0')}`
          const intervals = records.filter(e => e.start_at.toISOString().slice(0, 10) === day)
          return `${day} | ${intervals.map(e => `${e.start_at.toISOString().slice(11, 16)}–${e.end_at?.toISOString().slice(11, 16) ?? 'pendente'} ${e.kind}`).join('; ') || 'sem registro'}`
        }), 'Assinatura do profissional: __________________________', 'Assinatura do representante: __________________________']
    }
    if (kind === 'SERVICOS') return [...header, ...view.team.map(t => `${t.name} | ${t.role} | ${t.description ?? 'descrição pendente'} | ${t.quantity ?? 'quantidade pendente'} ${t.contracted_unit ?? 'unidade pendente'} | ${t.amount ?? 'valor pendente'}`)]
    if (kind === 'FINANCEIRO') return [...header, `Entradas pagas: ${view.financial.received}`, `Saídas pagas: ${view.financial.spent}`, `Saldo do período: ${view.financial.period_balance}`,
      `Saldo bancário: não conciliado`, ...view.financial.entries.map(e => `${e.date.toISOString().slice(0, 10)} | ${e.description} | ${e.status} | ${e.type} | ${e.amount}`)]
    if (kind === 'OBJETO') {
      const narrative = (view.month.execution_data ?? {}) as { activities?: string; results?: string; deviations?: string; justifications?: string; source_ids?: string[] }
      return [...header, `Atividades registradas: ${view.attendance.reduce((n, t) => n + t.aulas.filter(a => a.status === 'REALIZADA').length, 0)}`,
      `Beneficiários únicos: ${new Set(view.attendance.flatMap(t => t.beneficiarios.map(b => b.beneficiary_id))).size}`,
      'Comparação com metas pactuadas: indisponível até cadastrar o plano de trabalho e as metas confirmadas.',
      `Atividades descritas: ${narrative.activities || 'revisão humana pendente'}`,
      `Resultados: ${narrative.results || 'revisão humana pendente'}`,
      `Desvios: ${narrative.deviations || 'revisão humana pendente'}`,
      `Justificativas: ${narrative.justifications || 'revisão humana pendente'}`,
      `Fontes: ${narrative.source_ids?.join(', ') || 'não vinculadas'}`]
    }
    return [...header, ...view.month.requirements.map(r => `${r.rule.title} | ${r.status} | ${r.rule.origin} | ${r.rule.source_reference ?? 'fonte pendente'}`)]
  }

  private async pdf(title: string, lines: string[], draft: boolean, landscape: boolean) {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const width = landscape ? 842 : 595, height = landscape ? 595 : 842
    let page = doc.addPage([width, height]), y = height - 57
    const newPage = () => { page = doc.addPage([width, height]); y = height - 57; page.drawText(text(title), { x: 45, y: height - 32, size: 12, font: bold }) }
    page.drawText(text(title), { x: 45, y: height - 32, size: 12, font: bold })
    for (const raw of lines) {
      const chunks = text(raw).match(new RegExp(`.{1,${landscape ? 125 : 90}}(\\s|$)|.{1,${landscape ? 125 : 90}}`, 'g')) ?? ['']
      for (const line of chunks) {
        if (y < 65) newPage()
        page.drawText(line.trim(), { x: 45, y, size: 9, font, color: rgb(0.15, 0.2, 0.3) })
        y -= 17
      }
    }
    const pages = doc.getPages()
    pages.forEach((p, i) => {
      p.drawText(`Amparo Gov | ${draft ? 'RASCUNHO - revisao pendente | ' : ''}Pagina ${i + 1}/${pages.length}`, { x: 45, y: 30, size: 8, font })
    })
    return Buffer.from(await doc.save())
  }

  private async xlsx(title: string, lines: string[]) {
    const book = new ExcelJS.Workbook()
    book.creator = 'Amparo Gov'
    const sheet = book.addWorksheet(title.slice(0, 31))
    sheet.columns = [{ width: 115 }]
    sheet.addRow([title]).font = { bold: true, size: 16 }
    for (const line of lines) sheet.addRow([line])
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.getColumn(1).alignment = { wrapText: true, vertical: 'middle' }
    return Buffer.from(await book.xlsx.writeBuffer())
  }

  private async attendanceXlsx(title: string, view: Awaited<ReturnType<MonthlyService['overview']>>, classId?: string) {
    const book = new ExcelJS.Workbook()
    book.creator = 'Amparo Gov'
    for (const turma of view.attendance.filter(t => !classId || t.id === classId)) {
      const sheet = book.addWorksheet(turma.nome.replace(/[\\/*?:\[\]]/g, ' ').slice(0, 31) || 'Presença')
      const lessons = turma.aulas.filter(a => a.status === 'REALIZADA')
      sheet.addRow([`${title} · ${view.month.month.toISOString().slice(0, 7)}`, turma.nome, turma.modalidade ?? 'Modalidade pendente'])
      sheet.addRow(['Beneficiário', ...lessons.map(a => a.inicio.toISOString().slice(0, 10)), 'Presentes', 'Aulas aplicáveis', 'Frequência'])
      sheet.getRow(1).font = { bold: true, size: 14 }
      sheet.getRow(2).font = { bold: true }
      sheet.getColumn(1).width = 35
      for (let c = 2; c <= lessons.length + 4; c++) sheet.getColumn(c).width = 18
      for (const beneficiary of turma.beneficiarios) {
        const row = sheet.addRow([beneficiary.nome, ...lessons.map(a => beneficiary.records.find(r => r.aula_id === a.id)?.status ?? '')])
        if (lessons.length) {
          const n = row.number, last = lessons.length + 1
          const range = `B${n}:${sheet.getColumn(last).letter}${n}`
          row.getCell(lessons.length + 2).value = { formula: `COUNTIF(${range},"PRESENTE")` }
          row.getCell(lessons.length + 3).value = { formula: `COUNTA(${range})` }
          row.getCell(lessons.length + 4).value = { formula: `IF(COUNTIF(${range},"PENDENTE")>0,"PENDENTE",IFERROR(COUNTIF(${range},"PRESENTE")/COUNTA(${range}),""))` }
        } else { row.getCell(2).value = 0; row.getCell(3).value = 0 }
        row.getCell(lessons.length + 4).numFmt = '0.00%'
      }
      sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }]
      sheet.addRow(['Assinatura do responsável: __________________________'])
    }
    if (!book.worksheets.length) book.addWorksheet('Sem turmas').addRow(['Nenhuma turma vinculada ao projeto'])
    return Buffer.from(await book.xlsx.writeBuffer())
  }

  private async pointXlsx(title: string, view: Awaited<ReturnType<MonthlyService['overview']>>, teamId?: string) {
    const team = view.team.find(t => t.id === teamId)
    if (!team) throw new NotFoundException('Profissional não encontrado nesta competência')
    const book = new ExcelJS.Workbook()
    book.creator = 'Amparo Gov'
    const sheet = book.addWorksheet('Ponto')
    sheet.columns = [{ header: 'Data', width: 16 }, { header: 'Dia', width: 14 }, { header: 'Profissional', width: 30 },
      { header: 'Entrada', width: 23 }, { header: 'Saída', width: 23 }, { header: 'Minutos', width: 14 },
      { header: 'Tipo', width: 18 }, { header: 'Justificativa', width: 35 }]
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    const { days } = monthBounds(view.month.month.toISOString().slice(0, 7))
    const first = view.month.month
    for (let day = 1; day <= days; day++) {
      const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day))
      const dateKey = date.toISOString().slice(0, 10)
      const entries = view.month.point_entries.filter(e => e.team_link_id === teamId && e.start_at.toISOString().slice(0, 10) === dateKey)
      for (const entry of entries.length ? entries : [null]) {
        const row = sheet.addRow([date, ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][date.getUTCDay()], team.name,
          entry?.start_at ?? null, entry?.end_at ?? null, null, entry?.kind ?? '', entry?.justification ?? ''])
        row.getCell(1).numFmt = 'dd/mm/yyyy'
        row.getCell(4).numFmt = 'dd/mm/yyyy hh:mm'
        row.getCell(5).numFmt = 'dd/mm/yyyy hh:mm'
        if (entry?.end_at && entry.kind === 'REALIZADO') row.getCell(6).value = { formula: `ROUND((E${row.number}-D${row.number})*1440,0)`, result: Math.round((entry.end_at.getTime() - entry.start_at.getTime()) / 60000) }
      }
    }
    sheet.addRow(['Assinatura do profissional: __________________________'])
    sheet.addRow(['Assinatura do representante: __________________________'])
    return Buffer.from(await book.xlsx.writeBuffer())
  }

  private async financialXlsx(title: string, view: Awaited<ReturnType<MonthlyService['overview']>>) {
    const book = new ExcelJS.Workbook()
    book.creator = 'Amparo Gov'
    const sheet = book.addWorksheet('Financeiro')
    sheet.columns = [{ header: 'Data de execução', width: 20 }, { header: 'Descrição', width: 50 }, { header: 'Tipo', width: 16 },
      { header: 'Situação', width: 20 }, { header: 'Valor do lançamento', width: 22 }, { header: 'Pago no período', width: 22 }]
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    for (const entry of view.financial.entries) {
      const row = sheet.addRow([entry.date, entry.description, entry.type, entry.status, Number(entry.amount), Number(entry.paid_in_period)])
      row.getCell(1).numFmt = 'dd/mm/yyyy'
      row.getCell(5).numFmt = '#,##0.00'
      row.getCell(6).numFmt = '#,##0.00'
    }
    const end = sheet.rowCount
    const total = sheet.addRow(['Total', null, null, null, null, null])
    if (end > 1) { total.getCell(5).value = { formula: `SUM(E2:E${end})` }; total.getCell(6).value = { formula: `SUM(F2:F${end})` } }
    sheet.addRow(['Saldo bancário não conciliado: saldo inicial ou extrato ausente'])
    return Buffer.from(await book.xlsx.writeBuffer())
  }

  async generate(tenantId: string, userId: string, monthId: string, kind: string, format: string, teamId?: string, classId?: string) {
    if (!['PRESENCA', 'PONTO', 'SERVICOS', 'OBJETO', 'FINANCEIRO', 'CHECKLIST'].includes(kind) || !['pdf', 'xlsx', 'csv'].includes(format)) throw new BadRequestException('Formato ou modelo inválido')
    if (format === 'csv' && kind !== 'FINANCEIRO') throw new BadRequestException('CSV disponível somente para financeiro')
    const view = await this.monthly.overview(tenantId, monthId)
    if (view.month.status !== 'ABERTA') throw new BadRequestException('Documentos fechados são imutáveis; abra revisão')
    const turma = classId ? view.attendance.find(t => t.id === classId) : undefined
    if (classId && (kind !== 'PRESENCA' || !turma)) throw new BadRequestException('Turma inválida para este documento')
    const templates = await this.db.accountabilityTemplate.findMany({ where: { tenant_id: tenantId, code: kind }, orderBy: { version: 'desc' } })
    const matching = templates.filter(t => { const s = t.scope as Record<string, string>; return (!s.project_id || s.project_id === view.month.project_id) &&
      (!s.instrument_id || s.instrument_id === view.month.instrument_id) && (!s.competence_id || s.competence_id === monthId) &&
      (!s.turma_id || s.turma_id === classId) && (!s.modalidade || s.modalidade === turma?.modalidade) })
    const template = matching.sort((a, b) => Object.keys(b.scope as object).length - Object.keys(a.scope as object).length || b.version - a.version)[0]
    const sourceHash = createHash('sha256').update(JSON.stringify({ source: view.source_hash, template: template?.id, teamId, classId })).digest('hex')
    const docKind = teamId ? `${kind}_${teamId}` : classId ? `${kind}_${classId}` : kind
    const latest = await this.db.monthlyGeneratedDocument.findFirst({ where: { competence_id: monthId, kind: docKind, format }, orderBy: { version: 'desc' } })
    if (latest?.source_hash === sourceHash) return latest
    const baseLines = await this.lines(kind, view, teamId, classId)
    const fields = (template?.fields ?? {}) as { intro?: string; footer?: string }
    const layout = (template?.layout ?? {}) as { orientation?: string }
    const lines = [fields.intro, ...baseLines, fields.footer].filter((x): x is string => typeof x === 'string')
    const draft = Boolean(view.blockers.length || view.attendance_pending || view.point.issues.length || view.month.requirements.some(r => r.applies && !['VALIDADO', 'DISPENSADO'].includes(r.status)))
    const bytes = format === 'pdf' ? await this.pdf(template?.title ?? kind, lines, draft, layout.orientation === 'landscape') : format === 'xlsx' ?
      kind === 'PRESENCA' ? await this.attendanceXlsx(template?.title ?? kind, view, classId) : kind === 'PONTO' ? await this.pointXlsx(template?.title ?? kind, view, teamId) :
      kind === 'FINANCEIRO' ? await this.financialXlsx(template?.title ?? kind, view) : await this.xlsx(template?.title ?? kind, lines) : Buffer.from('\uFEFF' + [
      ['Data', 'Descrição', 'Tipo', 'Situação', 'Valor'].map(csvCell).join(','),
      ...view.financial.entries.map(e => [e.date.toISOString().slice(0, 10), e.description, e.type, e.status, e.amount].map(csvCell).join(',')),
    ].join('\r\n'))
    const key = `${tenantId}/accountability/${monthId}/${randomUUID()}.${format}`
    await this.storage.save(key, bytes)
    try {
      const result = await this.db.monthlyGeneratedDocument.create({ data: { competence_id: monthId, template_id: template?.id, kind: docKind,
        format, version: (latest?.version ?? 0) + 1, storage_key: key, sha256: sha(bytes), source_hash: sourceHash, created_by: userId } })
      await this.db.monthlyEvent.create({ data: { competence_id: monthId, actor_id: userId, action: 'GERACAO', details: { document_id: result.id, kind: docKind, format } } })
      return result
    } catch (e) { await this.storage.delete(key); throw e }
  }

  async attachSigned(tenantId: string, userId: string, monthId: string, generatedId: string, documentId: string, signatureState: string) {
    const month = await this.monthly.get(tenantId, monthId)
    if (month.status !== 'ABERTA') throw new BadRequestException('Abra revisão para anexar versão assinada')
    const generated = month.documents.find(d => d.id === generatedId)
    const evidence = await this.db.document.findFirst({ where: { id: documentId, tenant_id: tenantId, project_id: month.project_id, deleted_at: null } })
    if (!generated || !evidence?.file_url) throw new NotFoundException('Documento não encontrado no projeto')
    if (signatureState === 'DIGITAL_VERIFICADA') throw new BadRequestException('Validação criptográfica ainda não está disponível')
    const updated = await this.db.monthlyGeneratedDocument.create({ data: { competence_id: monthId, template_id: generated.template_id,
      kind: generated.kind, format: generated.format, version: Math.max(...month.documents.filter(d => d.kind === generated.kind && d.format === generated.format).map(d => d.version)) + 1,
      storage_key: generated.storage_key, sha256: generated.sha256, source_hash: generated.source_hash, signed_document_id: documentId,
      signature_state: 'ASSINADO_ANEXADO', created_by: userId } })
    await this.db.monthlyEvent.create({ data: { competence_id: monthId, actor_id: userId, action: 'ANEXO_ASSINADO', details: { generatedId, documentId } } })
    return updated
  }

  async uploadSigned(tenantId: string, userId: string, monthId: string, generatedId: string, file: { buffer: Buffer; mimetype: string; filename: string }) {
    const month = await this.monthly.get(tenantId, monthId)
    if (month.status !== 'ABERTA' || !month.documents.some(d => d.id === generatedId)) throw new BadRequestException('Documento não disponível para anexo')
    if (file.buffer.length < 5 || file.buffer.length > 20 * 1024 * 1024 || !file.filename.toLowerCase().endsWith('.pdf') || file.mimetype !== 'application/pdf' || file.buffer.subarray(0, 5).toString() !== '%PDF-') {
      throw new BadRequestException('Envie PDF válido de até 20 MB')
    }
    const key = `${tenantId}/accountability/${monthId}/signed/${randomUUID()}.pdf`
    await this.storage.save(key, file.buffer)
    let evidenceId: string | null = null
    try {
      const evidence = await this.db.document.create({ data: { tenant_id: tenantId, project_id: month.project_id, name: file.filename,
        type: 'OUTROS', status: 'ASSINADO', file_url: key, file_size: BigInt(file.buffer.length), mime_type: 'application/pdf',
        metadata: { monthly_competence_id: monthId, generated_document_id: generatedId, sha256: sha(file.buffer), signature_state: 'ASSINADO_ANEXADO' }, created_by: userId } })
      evidenceId = evidence.id
      return await this.attachSigned(tenantId, userId, monthId, generatedId, evidence.id, 'ASSINADO_ANEXADO')
    } catch (e) { if (evidenceId) await this.db.document.delete({ where: { id: evidenceId } }).catch(() => undefined); await this.storage.delete(key).catch(() => undefined); throw e }
  }

  async download(tenantId: string, monthId: string, id: string) {
    const month = await this.monthly.get(tenantId, monthId)
    const doc = month.documents.find(d => d.id === id)
    if (!doc) throw new NotFoundException('Documento não encontrado')
    return { stream: this.storage.readStream(doc.storage_key), filename: `${doc.kind}-${month.month.toISOString().slice(0, 7)}-v${doc.version}.${doc.format}` }
  }

  async dossier(tenantId: string, monthId: string) {
    const month = await this.monthly.get(tenantId, monthId)
    const stream = new PassThrough()
    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.on('error', (error: Error) => stream.destroy(error))
    archive.pipe(stream)
    const signed = await this.db.document.findMany({ where: { tenant_id: tenantId, project_id: month.project_id,
      id: { in: month.documents.map(d => d.signed_document_id).filter((x): x is string => Boolean(x)) } } })
    const manifest = { month: month.month, revision: month.revision, status: month.status, closed_at: month.closed_at,
      snapshot_hash: month.snapshot_hash, files: month.documents.map(d => ({ name: `${d.kind}-v${d.version}.${d.format}`, sha256: d.sha256, template_id: d.template_id,
        signed_document_id: d.signed_document_id })), signed_files: signed.map(d => ({ name: `${d.id}.pdf`, sha256: (d.metadata as { sha256?: string } | null)?.sha256 ?? null })) }
    archive.append(JSON.stringify(manifest, null, 2), { name: 'indice.json' })
    for (const doc of month.documents) archive.append(this.storage.readStream(doc.storage_key), { name: `documentos/${doc.kind}-v${doc.version}.${doc.format}` })
    for (const doc of signed) if (doc.file_url) archive.append(this.storage.readStream(doc.file_url), { name: `assinados/${doc.id}.pdf` })
    void archive.finalize()
    return stream
  }
}
