import { Prisma } from '@prisma/client'
import { MonthlyService } from './monthly.service'

const date = (day: string) => new Date(`${day}T12:00:00Z`)
const tx = (id: string, status: 'APROVADO' | 'PAGO', amount: string, orders: { amount: Prisma.Decimal; paid_at: Date }[] = []) => ({
  id, date: date('2026-09-10'), paid_at: status === 'PAGO' ? date('2026-09-12') : null,
  description: id, status, type: 'DESPESA', amount: new Prisma.Decimal(amount), payment_orders: orders,
  invoices: [], matched_statements: [],
})

describe('competência mensal', () => {
  it('não conta despesa apenas aprovada e evita duplicar pagamentos parciais', async () => {
    const db = { monthlyCompetence: { findFirst: jest.fn().mockResolvedValue({ id: 'm1', tenant_id: 't1', project_id: 'p1', month: date('2026-09-01'),
      instrument: { number: 'i1' }, requirements: [], documents: [], point_entries: [], events: [] }) },
      transaction: { findMany: jest.fn().mockResolvedValue([
        tx('aprovada', 'APROVADO', '300'),
        tx('parcial', 'PAGO', '500', [{ amount: new Prisma.Decimal('120'), paid_at: date('2026-09-15') }]),
      ]) } }
    const service = new MonthlyService(db as any)
    const result = await service.financial('t1', 'm1')
    expect(result.approved_unpaid.toString()).toBe('300')
    expect(result.spent.toString()).toBe('120')
    expect(result.reconciled).toBe(false)
    expect(result.bank_balance).toBeNull()
    expect(db.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: 't1', project_id: 'p1' }) }))
  })
  it('rejeita competência de outro tenant antes de consultar fontes', async () => {
    const db = { monthlyCompetence: { findFirst: jest.fn().mockResolvedValue(null) }, transaction: { findMany: jest.fn() } }
    const service = new MonthlyService(db as any)
    await expect(service.financial('t2', 'm1')).rejects.toThrow('Competência não encontrada')
    expect(db.transaction.findMany).not.toHaveBeenCalled()
  })
  it('considera matrícula iniciada no mês, exclui aula cancelada e não cria falta sem chamada', async () => {
    const db = { monthlyCompetence: { findFirst: jest.fn().mockResolvedValue({ id: 'm1', tenant_id: 't1', project_id: 'p1', month: date('2026-09-01'),
      instrument: { number: 'i1' }, requirements: [], documents: [], point_entries: [], events: [] }) },
      turma: { findMany: jest.fn().mockResolvedValue([{ id: 'class-1', nome: 'Turma', curso: { nome: 'Modalidade' }, horario: null,
        matriculas: [{ id: 'enrollment-1', created_at: date('2026-09-10'), aluno: { id: 'b1', name: 'Pessoa' } }],
        aulas: [
          { id: 'before', inicio: date('2026-09-05'), fim: date('2026-09-05'), execution_status: 'REALIZADA', chamada_enviada_at: date('2026-09-05'), presencas: [] },
          { id: 'after', inicio: date('2026-09-15'), fim: date('2026-09-15'), execution_status: 'REALIZADA', chamada_enviada_at: null, presencas: [] },
          { id: 'cancelled', inicio: date('2026-09-20'), fim: date('2026-09-20'), execution_status: 'CANCELADA', chamada_enviada_at: null, presencas: [] },
        ], presencas: [] }]) } }
    const result = await new MonthlyService(db as any).attendance('t1', 'm1')
    const person = result[0].beneficiarios[0]
    expect(person.applicable).toBe(1)
    expect(person.pending).toBe(1)
    expect(person.percent).toBeNull()
    expect(person.records[0].status).toBe('PENDENTE')
  })
})
