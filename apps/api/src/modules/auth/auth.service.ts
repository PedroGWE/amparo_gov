import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { Env } from '../../config/env'
import type { JwtPayload } from './types/jwt-payload'
import type { LoginDto } from './dto/login.dto'
import type { RegisterDto } from './dto/register.dto'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService<Env>,
  ) {}

  async login(dto: LoginDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } })
    if (!tenant || tenant.deleted_at) throw new NotFoundException('Tenant não encontrado')

    const user = await this.prisma.user.findUnique({
      where: { tenant_id_email: { tenant_id: tenant.id, email: dto.email } },
      include: {
        user_roles: { include: { role: { select: { permissions: true } } } },
      },
    })
    if (!user || user.deleted_at) throw new UnauthorizedException('Credenciais inválidas')
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Conta suspensa ou inativa')

    const valid = await bcrypt.compare(dto.password, user.password_hash)
    if (!valid) throw new UnauthorizedException('Credenciais inválidas')

    const permissions = this.extractPermissions(user.user_roles)
    const tokens = await this.generateTokens(user.id, tenant.id, user.email, permissions)

    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    })

    return { ...tokens, user: { ...this.sanitizeUser(user), permissions } }
  }

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12)
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: dto.tenantName,
            slug: dto.tenantSlug,
            type: dto.tenantType,
            status: 'TRIAL',
          },
        })
        const adminRole = await tx.role.create({
          data: {
            tenant_id: tenant.id,
            name: 'ADMIN',
            is_system: true,
            permissions: ['*'],
          },
        })
        const user = await tx.user.create({
          data: {
            tenant_id: tenant.id,
            name: dto.name,
            email: dto.email,
            password_hash: passwordHash,
            status: 'ACTIVE',
            user_roles: { create: { role_id: adminRole.id } },
          },
        })
        const tokens = await this.generateTokens(user.id, tenant.id, user.email, ['*'], tx)
        return { ...tokens, user: { ...this.sanitizeUser(user), permissions: ['*'] } }
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Slug já utilizado')
      }
      throw error
    }
  }

  async refresh(tokenRaw: string) {
    const tokenHash = this.hashToken(tokenRaw)
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.refreshToken.findUnique({ where: { token_hash: tokenHash } })
      const now = new Date()
      if (!stored) throw new UnauthorizedException('Refresh token inválido ou expirado')

      const consumed = await tx.refreshToken.updateMany({
        where: { id: stored.id, revoked_at: null, expires_at: { gt: now } },
        data: { revoked_at: now },
      })
      if (consumed.count !== 1) {
        throw new UnauthorizedException('Refresh token inválido, expirado ou já utilizado')
      }

      const user = await tx.user.findUnique({
        where: { id: stored.user_id },
        include: { user_roles: { include: { role: { select: { permissions: true } } } } },
      })
      if (!user || user.status !== 'ACTIVE' || user.deleted_at) throw new UnauthorizedException()

      const tenant = await tx.tenant.findUnique({ where: { id: user.tenant_id } })
      if (!tenant || !['ACTIVE', 'TRIAL'].includes(tenant.status) || tenant.deleted_at) {
        throw new UnauthorizedException()
      }

      const permissions = this.extractPermissions(user.user_roles)
      return this.generateTokens(user.id, user.tenant_id, user.email, permissions, tx)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async revokeToken(tokenRaw: string) {
    const tokenHash = this.hashToken(tokenRaw)
    await this.prisma.refreshToken.updateMany({
      where: { token_hash: tokenHash, revoked_at: null },
      data: { revoked_at: new Date() },
    })
  }

  private async generateTokens(
    userId: string,
    tenantId: string,
    email: string,
    permissions: string[],
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const payload: JwtPayload = { sub: userId, tenantId, email, permissions }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN'),
      }),
      this.generateRefreshToken(userId, db),
    ])

    return { accessToken, refreshToken }
  }

  private async generateRefreshToken(
    userId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string> {
    const raw = crypto.randomBytes(64).toString('hex')
    const hash = this.hashToken(raw)
    const expiresIn = this.config.get('JWT_REFRESH_EXPIRES_IN')!
    const days = parseInt(expiresIn) || 7
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    await db.refreshToken.create({
      data: { user_id: userId, token_hash: hash, expires_at: expiresAt },
    })

    return raw
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  private extractPermissions(userRoles: Array<{ role: { permissions: unknown } }>): string[] {
    const perms = new Set<string>()
    for (const { role } of userRoles) {
      const rolePerms = role.permissions as string[]
      rolePerms.forEach((p) => perms.add(p))
    }
    return [...perms]
  }

  private sanitizeUser(user: { id: string; name: string; email: string; tenant_id: string }) {
    return { id: user.id, name: user.name, email: user.email, tenantId: user.tenant_id }
  }
}
