import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import type { JwtPayload } from '../../modules/auth/types/jwt-payload'
import type { FastifyRequest } from 'fastify'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const req = context.switchToHttp().getRequest<FastifyRequest & { user: JwtPayload }>()
    const userPerms: string[] = req.user?.permissions ?? []
    const educationOnly =
      userPerms.length > 0 &&
      userPerms.every((p) => ['conecta:teacher', 'conecta:student'].includes(p))
    const controllerName = context.getClass().name
    if (
      educationOnly &&
      ![
        'AuthController',
        'EducaController',
        'ConectaTeacherController',
        'ConectaStudentController',
      ].includes(controllerName)
    )
      return false
    if (!required?.length) return true
    if (userPerms.includes('*')) return true
    return required.every((p) => userPerms.includes(p))
  }
}
