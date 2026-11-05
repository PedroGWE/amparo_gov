import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import type { JwtPayload } from '../auth/types/jwt-payload'

@Injectable()
export class EducaAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (['material', 'activity', 'submit', 'grade', 'upload', 'download'].includes(context.getHandler().name)) return false
    const request = context.switchToHttp().getRequest<FastifyRequest & { user: JwtPayload }>()
    const permissions = request.user?.permissions ?? []
    return permissions.includes('*') || permissions.includes('educa:manage') || permissions.includes('conecta:teacher')
  }
}
