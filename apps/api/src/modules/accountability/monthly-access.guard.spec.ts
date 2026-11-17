import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common'
import { MonthlyAccessGuard } from './monthly-access.guard'

const request = (overrides: Record<string, unknown> = {}) => ({
  user: { sub: 'member-1', tenantId: 'tenant-1', permissions: ['accountability:read'] },
  params: { instrumentId: 'instrument-1' }, query: {}, body: {}, method: 'GET', url: '/accountability/monthly/instruments/instrument-1/expenses',
  ...overrides,
})
const context = (value: ReturnType<typeof request>) => ({ switchToHttp: () => ({ getRequest: () => value }) }) as ExecutionContext

describe('MonthlyAccessGuard', () => {
  it('denies a direct instrument URL from another tenant', async () => {
    const db = { accountabilityInstrument: { findFirst: jest.fn().mockResolvedValue(null) } }
    const guard = new MonthlyAccessGuard(db as never)
    await expect(guard.canActivate(context(request()))).rejects.toBeInstanceOf(NotFoundException)
  })

  it('denies a project member from another project in the same tenant', async () => {
    const db = {
      accountabilityInstrument: { findFirst: jest.fn().mockResolvedValue({ project_id: 'project-2' }) },
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'project-2', manager_id: 'manager-2', created_by: 'creator-2' }) },
      projectMember: { findFirst: jest.fn().mockResolvedValue(null) },
      professorProjeto: { findFirst: jest.fn().mockResolvedValue(null) },
    }
    const guard = new MonthlyAccessGuard(db as never)
    await expect(guard.canActivate(context(request()))).rejects.toBeInstanceOf(ForbiddenException)
  })
})
