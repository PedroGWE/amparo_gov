import { ExecutionContext } from '@nestjs/common'
import { EducaAccessGuard } from './educa-access.guard'

function context(permissions: string[], handler = 'classes') {
  const method = Object.defineProperty(() => null, 'name', { value: handler })
  return {
    getHandler: () => method,
    switchToHttp: () => ({ getRequest: () => ({ user: { permissions } }) }),
  } as unknown as ExecutionContext
}

describe('EducaAccessGuard', () => {
  const guard = new EducaAccessGuard()

  it('allows teachers and managers to use attendance routes', () => {
    expect(guard.canActivate(context(['conecta:teacher']))).toBe(true)
    expect(guard.canActivate(context(['educa:manage']))).toBe(true)
    expect(guard.canActivate(context(['*']))).toBe(true)
  })

  it('keeps the initial release closed to students', () => {
    expect(guard.canActivate(context(['conecta:student']))).toBe(false)
  })

  it('pauses materials and activity endpoints for every role', () => {
    expect(guard.canActivate(context(['conecta:teacher'], 'material'))).toBe(false)
    expect(guard.canActivate(context(['*'], 'submit'))).toBe(false)
  })
})
