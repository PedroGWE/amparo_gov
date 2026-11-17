import { MonthlyService } from './monthly.service'

const view = (validations: { stage: string; status: string }[]) => ({
  month: { id: 'month-1', tenant_id: 'tenant-1', status: 'ABERTA', updated_at: new Date('2026-09-10'), documents: [] },
  blockers: [], point: { issues: [] }, attendance_pending: 0, attendance: [], validations,
})

describe('fechamento mensal', () => {
  it('exige revisões paralelas antes do fechamento', async () => {
    const db = { monthlyCompetence: { updateMany: jest.fn() } }
    const service = new MonthlyService(db as never)
    jest.spyOn(service, 'overview').mockResolvedValue(view([{ stage: 'ATIVIDADES', status: 'APROVADO' }]) as never)
    await expect(service.close('tenant-1', 'user-1', 'month-1', {})).rejects.toThrow('FINANCEIRO')
    expect(db.monthlyCompetence.updateMany).not.toHaveBeenCalled()
  })

  it('fecha internamente sem criar protocolo externo', async () => {
    const db = { monthlyCompetence: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn().mockResolvedValue({ id: 'month-1' }) },
      monthlyEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) } }
    const service = new MonthlyService(db as never)
    jest.spyOn(service, 'overview').mockResolvedValue(view(['ATIVIDADES', 'FINANCEIRO', 'INSTITUCIONAL'].map(stage => ({ stage, status: 'APROVADO' }))) as never)
    jest.spyOn(service, 'get').mockResolvedValue({ id: 'month-1' } as never)
    await service.close('tenant-1', 'user-1', 'month-1', {})
    expect(db.monthlyCompetence.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FECHADA' }) }))
    expect(db.monthlyEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'FECHAMENTO' }) }))
  })
})
