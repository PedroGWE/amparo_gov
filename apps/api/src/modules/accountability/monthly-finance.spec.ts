import { Prisma } from '@prisma/client'
import { MonthlyService } from './monthly.service'

const expense = (overrides: Record<string, unknown> = {}) => ({ id: 'expense-1', tenant_id: 'tenant-1', instrument_id: 'instrument-1', transaction_id: 'transaction-1',
  work_plan_version: 'v1', budget_line: 'Material', account_reference: 'account-1', classification: 'OBJETO', release_status: 'LIBERADA',
  documents: { NOTA_FISCAL: { status: 'VALIDADO', evidence_id: 'document-1' } }, payments: [], ...overrides })

describe('conferência financeira da prestação', () => {
  it('bloqueia liberação com documento obrigatório pendente', async () => {
    const db = { accountabilityExpense: { findFirst: jest.fn().mockResolvedValue(expense({ release_status: 'PREPARACAO', documents: { NOTA_FISCAL: { status: 'PENDENTE' } } })) } }
    await expect(new MonthlyService(db as never).releaseExpense('tenant-1', 'expense-1', 'user-1')).rejects.toThrow('documentos exigidos')
  })

  it('aceita parcela e impede pagamento acima do saldo em aberto', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'payment-2' })
    const payments = [{ amount: new Prisma.Decimal('40') }]
    const tx = { transaction: { findFirst: jest.fn().mockResolvedValue({ amount: new Prisma.Decimal('100') }) },
      accountabilityPayment: { findMany: jest.fn().mockResolvedValue(payments), findFirst: jest.fn().mockResolvedValue(null), create } }
    const db = { accountabilityExpense: { findFirst: jest.fn().mockResolvedValue(expense()) },
      accountabilityInstrument: { findFirst: jest.fn().mockResolvedValue({ id: 'instrument-1', project_id: 'project-1' }) },
      document: { findFirst: jest.fn().mockResolvedValue({ id: 'document-1', project_id: 'project-1' }) },
      $transaction: jest.fn((fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)) }
    const service = new MonthlyService(db as never)
    const input = { amount: '60', paid_at: '2026-09-12', operation_reference: 'op-2', evidence_id: 'document-1' }
    await expect(service.registerPayment('tenant-1', 'expense-1', 'user-1', input)).resolves.toEqual({ id: 'payment-2' })
    expect(create).toHaveBeenCalledTimes(1)
    await expect(service.registerPayment('tenant-1', 'expense-1', 'user-1', { ...input, amount: '61' })).rejects.toThrow('saldo em aberto')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('rejeita conciliação com conta divergente', async () => {
    const db = { accountabilityPayment: { findFirst: jest.fn().mockResolvedValue({ id: 'payment-1', amount: new Prisma.Decimal('50'), expense: expense() }),
      findMany: jest.fn(), update: jest.fn() }, accountStatement: { findFirst: jest.fn().mockResolvedValue({ amount: new Prisma.Decimal('-50'), reconciliation: { account_id: 'other-account' } }) } }
    await expect(new MonthlyService(db as never).reconcilePayment('tenant-1', 'payment-1', 'statement-1')).rejects.toThrow('Conta do extrato difere')
    expect(db.accountabilityPayment.update).not.toHaveBeenCalled()
  })
})
