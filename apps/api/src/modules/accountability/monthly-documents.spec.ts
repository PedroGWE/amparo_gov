import { PDFDocument } from 'pdf-lib'
import ExcelJS from 'exceljs'
import { Readable } from 'node:stream'
import unzipper from 'unzipper'
import { MonthlyDocumentsService } from './monthly-documents.service'

const monthView = (month: string) => ({
  month: { id: month, month: new Date(`${month}-01T00:00:00Z`), project_id: 'p1', instrument_id: 'i1', instrument: { number: 'N-1' },
    revision: 1, status: 'ABERTA', point_entries: [], requirements: [] },
  attendance: ['Dança', 'Esporte'].map((name, i) => ({ id: `turma-${i}`, nome: name, modalidade: name, horario: null,
    aulas: [{ id: `aula-${i}`, inicio: new Date(`${month}-10T12:00:00Z`) }],
    beneficiarios: [{ matricula_id: `m-${i}`, beneficiary_id: `b-${i}`, nome: `Beneficiário ${i}`, records: [{ aula_id: `aula-${i}`, status: 'PRESENTE' }], percent: 100, pending: 0 }] })),
  financial: { entries: [], received: '0', spent: '0', period_balance: '0' }, source_hash: month, blockers: [], attendance_pending: 0, point: { issues: [], minutes: 0 },
})

it('usa o mesmo template em duas modalidades e dois meses sem copiar execução', async () => {
  const saved = new Map<string, Buffer>()
  const db = { accountabilityTemplate: { findMany: jest.fn().mockResolvedValue([{ id: 'template-v1', title: 'Lista de presença', version: 1,
    scope: {}, layout: { orientation: 'landscape' }, fields: {} }]) },
    monthlyGeneratedDocument: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(({ data }) => ({ id: `doc-${saved.size}`, ...data })) },
    monthlyEvent: { create: jest.fn() }, document: { findMany: jest.fn().mockResolvedValue([]) } }
  const storage = { save: jest.fn().mockImplementation(async (key: string, bytes: Buffer) => { saved.set(key, bytes) }), delete: jest.fn(),
    readStream: jest.fn().mockImplementation((key: string) => Readable.from(saved.get(key)!)) }
  let selectedMonth = '2026-09'
  const monthly = { overview: jest.fn().mockImplementation(async () => monthView(selectedMonth)) }
  const service = new MonthlyDocumentsService(db as any, storage as any, monthly as any)
  const first = await service.generate('t1', 'u1', '2026-09', 'PRESENCA', 'pdf', undefined, 'turma-0')
  const pdf = await PDFDocument.load(saved.get(first.storage_key)!)
  expect(pdf.getPageCount()).toBeGreaterThan(0)
  expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight())
  selectedMonth = '2026-10'
  const second = await service.generate('t1', 'u1', '2026-10', 'PRESENCA', 'xlsx', undefined, 'turma-1')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(saved.get(second.storage_key)! as unknown as Parameters<typeof workbook.xlsx.load>[0])
  const values = [...workbook.worksheets[0].getColumn(1).values].join(' ')
  expect(String(workbook.worksheets[0].getRow(1).getCell(2).value)).toContain('Esporte')
  expect(values).toContain('2026-10')
  expect(values).not.toContain('Dança')
  expect(first.template_id).toBe(second.template_id)
  const csv = await service.generate('t1', 'u1', '2026-10', 'FINANCEIRO', 'csv')
  expect(saved.get(csv.storage_key)!.toString()).toContain('"Data","Descrição","Tipo","Situação","Valor"')
  expect(saved.get(csv.storage_key)!.toString().trim().split('\n')).toHaveLength(1)
  ;(monthly as any).get = jest.fn().mockResolvedValue({ ...monthView('2026-10').month, documents: [second, csv], closed_at: new Date(), snapshot_hash: 'snapshot' })
  const zip = await service.dossier('t1', '2026-10')
  const chunks: Buffer[] = []
  for await (const chunk of zip) chunks.push(Buffer.from(chunk))
  const archive = await unzipper.Open.buffer(Buffer.concat(chunks))
  expect(archive.files.map(f => f.path)).toEqual(expect.arrayContaining(['indice.json', `documentos/${second.kind}-v${second.version}.${second.format}`]))
})
