import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ResourcesClient, NormalizedRecord, SourceError } from './resources.client'
import { calculatedStatus, compatibility, ManualInput, querySchema } from './resources.domain'
import type { z } from 'zod'

const visible = (tenantId: string): Prisma.ResourceRecordWhereInput => ({
  OR: [
    { scope: 'PUBLIC', tenant_id: null },
    { scope: tenantId, tenant_id: tenantId },
  ],
})
const include = {
  source: { include: { connector: true } },
  requirements: true,
  project: true,
  funders: { include: { funder: true } },
} as const

@Injectable()
export class ResourcesService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout
  private ticking = false
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: ResourcesClient,
  ) {}

  isGlobalAdmin(userId?: string) {
    return (
      !!userId &&
      (process.env.RESOURCES_ADMIN_USER_IDS ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .includes(userId)
    )
  }

  assertGlobalAdmin(userId: string) {
    if (!this.isGlobalAdmin(userId))
      throw new ForbiddenException(
        'A administração do catálogo compartilhado exige autorização do operador no servidor.',
      )
  }

  async onModuleInit() {
    if (process.env.RESOURCES_SCHEDULER_ENABLED === 'false') return
    this.timer = setInterval(() => void this.runDue(), 60000)
    this.timer.unref()
    void this.runDue()
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private present(row: any) {
    const { raw_data, scope, tenant_id, ...record } = row
    const connector = row.source?.connector
    return {
      ...record,
      calculated_status: calculatedStatus(row),
      stale:
        Date.now() - new Date(row.last_success_at).getTime() >
        Math.max(48, (connector?.interval_hours ?? 24) * 2) * 3600000,
      source: row.source
        ? {
            id: row.source.id,
            name: row.source.name,
            official_url: row.source.official_url,
            mode: row.source.mode,
            validation: row.source.validation,
          }
        : undefined,
      time_reference:
        'Datas sem horário são comparadas pelo calendário no fuso indicado; nenhum horário de encerramento foi atribuído.',
    }
  }

  private async availableIds(tenantId: string, kind = 'OPORTUNIDADE'): Promise<string[]> {
    // PostgreSQL compares calendar dates in their reference zone and instants by offset.
    // No artificial 23:59:59 deadline is saved or displayed.
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM resource_records
      WHERE kind = ${kind} AND availability_evidence = true AND restricted = false
        AND ((scope = 'PUBLIC' AND tenant_id IS NULL) OR (scope = ${tenantId} AND tenant_id = ${tenantId}))
        AND starts_on IS NOT NULL AND ends_on IS NOT NULL
        AND CASE WHEN length(starts_on) = 10 THEN timezone IS NOT NULL AND (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(timezone, 'UTC'))::date >= starts_on::date ELSE CURRENT_TIMESTAMP >= starts_on::timestamptz END
        AND CASE WHEN length(ends_on) = 10 THEN timezone IS NOT NULL AND (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(timezone, 'UTC'))::date <= ends_on::date ELSE CURRENT_TIMESTAMP <= ends_on::timestamptz END
    `)
    return rows.map((r) => r.id)
  }

  async search(tenantId: string, q: z.infer<typeof querySchema>) {
    const and: Prisma.ResourceRecordWhereInput[] = [visible(tenantId)]
    if (q.view === 'available') and.push({ id: { in: await this.availableIds(tenantId) } })
    if (q.view === 'history')
      and.push({ kind: { in: ['PROJETO_FINANCIADO', 'HISTORICO_FINANCIADOR'] } })
    if (q.view === 'fundraising') and.push({ kind: 'AUTORIZACAO_CAPTACAO' })
    if (q.view === 'public') and.push({ kind: 'TRANSFERENCIA_PUBLICA' })
    if (q.kind) and.push({ kind: q.kind })
    if (q.source) and.push({ source_id: q.source })
    if (q.q)
      and.push({
        OR: ['title', 'description', 'eligibility_text'].map((field) => ({
          [field]: { contains: q.q, mode: 'insensitive' },
        })),
      })
    if (q.theme) and.push({ theme: { contains: q.theme, mode: 'insensitive' } })
    if (q.territory) and.push({ territories: { has: q.territory } })
    if (q.profile) and.push({ eligible_profiles: { has: q.profile } })
    if (q.support_type)
      and.push({ support_type: { contains: q.support_type, mode: 'insensitive' } })
    if (q.funder)
      and.push({
        OR: [
          { funder_name: { contains: q.funder, mode: 'insensitive' } },
          { funders: { some: { funder: { name: { contains: q.funder, mode: 'insensitive' } } } } },
        ],
      })
    const where = { AND: and }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.resourceRecord.findMany({
        where,
        include,
        orderBy: [{ ends_on: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.resourceRecord.count({ where }),
    ])
    return {
      data: data.map((r) => this.present(r)),
      total,
      page: q.page,
      totalPages: Math.ceil(total / q.limit),
    }
  }

  async detail(tenantId: string, id: string) {
    const row = await this.prisma.resourceRecord.findFirst({
      where: { AND: [visible(tenantId), { id }] },
      include,
    })
    if (!row) throw new NotFoundException('Registro não encontrado nesta organização.')
    const profile = await this.prisma.resourceOrganization.findUnique({
      where: { tenant_id: tenantId },
    })
    return { ...this.present(row), compatibility: compatibility(profile, row.requirements) }
  }

  async dashboard(tenantId: string, userId?: string) {
    const ids = await this.availableIds(tenantId)
    const [available, history, upcoming, sources, runs] = await Promise.all([
      this.prisma.resourceRecord.count({
        where: { AND: [visible(tenantId), { id: { in: ids } }] },
      }),
      this.prisma.resourceRecord.count({
        where: {
          AND: [
            visible(tenantId),
            { kind: { in: ['PROJETO_FINANCIADO', 'HISTORICO_FINANCIADOR'] } },
          ],
        },
      }),
      this.prisma.resourceRecord.findMany({
        where: { AND: [visible(tenantId), { id: { in: ids } }] },
        orderBy: { ends_on: 'asc' },
        take: 5,
        include,
      }),
      this.prisma.resourceSource.findMany({ include: { connector: true } }),
      this.prisma.resourceSyncRun.findMany({ orderBy: { started_at: 'desc' }, take: 10 }),
    ])
    return {
      available,
      history,
      upcoming: upcoming.map((r) => this.present(r)),
      sources,
      runs,
      can_administer_connectors: this.isGlobalAdmin(userId),
    }
  }

  async profile(tenantId: string) {
    const saved = await this.prisma.resourceOrganization.findUnique({
      where: { tenant_id: tenantId },
    })
    if (saved) return saved
    const p = await this.prisma.organizationProfile.findUnique({ where: { tenant_id: tenantId } })
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    })
    return {
      name: p?.nome_organizacao ?? tenant?.name ?? '',
      applicant_type: null,
      legal_nature: null,
      uf: p?.uf ?? null,
      city: p?.municipio ?? null,
      themes: p?.areas_atuacao ?? [],
      founded_on: null,
      territorial_scope: p?.abrangencia ?? null,
    }
  }
  saveProfile(tenantId: string, data: any) {
    return this.prisma.resourceOrganization.upsert({
      where: { tenant_id: tenantId },
      create: { tenant_id: tenantId, ...data },
      update: data,
    })
  }

  async favorites(tenantId: string, userId: string) {
    const rows = await this.prisma.resourceFavorite.findMany({
      where: { tenant_id: tenantId, user_id: userId, record: visible(tenantId) },
      include: { record: { include } },
      orderBy: { updated_at: 'desc' },
    })
    return rows.map((f) => ({ ...f, record: this.present(f.record) }))
  }
  async favorite(
    tenantId: string,
    userId: string,
    id: string,
    data: { stage: string; notes?: string | null },
  ) {
    await this.detail(tenantId, id)
    return this.prisma.resourceFavorite.upsert({
      where: {
        tenant_id_user_id_record_id: { tenant_id: tenantId, user_id: userId, record_id: id },
      },
      create: { tenant_id: tenantId, user_id: userId, record_id: id, ...data },
      update: data,
    })
  }
  async unfavorite(tenantId: string, userId: string, id: string) {
    await this.prisma.resourceFavorite.deleteMany({
      where: { tenant_id: tenantId, user_id: userId, record_id: id },
    })
    return { ok: true }
  }

  private validateOfficialLink(input: ManualInput) {
    const host = new URL(input.source_url).hostname
    const allowed: Record<string, string[]> = {
      FBB: ['fbb.org.br', 'bb.com.br'],
      PETROBRAS: ['petrobras.com.br'],
      ESPORTE: ['gov.br'],
    }
    if (
      allowed[input.source_id] &&
      !allowed[input.source_id].some((d) => host === d || host.endsWith('.' + d))
    )
      throw new BadRequestException('O link não pertence ao domínio oficial desta fonte.')
  }
  async manual(tenantId: string, inputs: ManualInput[]) {
    inputs.forEach((i) => this.validateOfficialLink(i))
    return this.prisma.$transaction(
      async (tx) => {
        const result: string[] = []
        for (const input of inputs) {
          const requirements = [...input.requirements]
          if (
            input.eligible_profiles.length &&
            !requirements.some((r) => r.field === 'applicant_type')
          )
            requirements.push({
              field: 'applicant_type',
              operator: 'IN',
              value: input.eligible_profiles,
              evidence:
                input.eligibility_text ||
                'Perfis elegíveis transcritos pelo administrador do link oficial.',
            })
          if (input.eligibility_text && !requirements.some((r) => r.field === 'other'))
            requirements.push({
              field: 'other',
              operator: 'TEXT',
              value: input.eligibility_text,
              evidence: input.eligibility_text,
            })
          const row = await this.persist(
            input.source_id,
            { ...input, requirements, origin: 'CADASTRO_MANUAL', raw_data: input },
            tenantId,
            tx,
          )
          result.push(row.id)
        }
        return { ids: result, processed: result.length }
      },
      { timeout: 60000 },
    )
  }
  async removeManual(tenantId: string, id: string) {
    const result = await this.prisma.resourceRecord.deleteMany({
      where: { id, tenant_id: tenantId, scope: tenantId, origin: 'CADASTRO_MANUAL' },
    })
    if (!result.count)
      throw new NotFoundException('Registro manual não encontrado nesta organização.')
    return { ok: true }
  }

  async persist(
    sourceId: string,
    input: NormalizedRecord,
    scope = 'PUBLIC',
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const { requirements = [], project, funder, ...data } = input
    const { source_id, ...clean } = data
    const now = new Date()
    const update = {
      ...clean,
      starts_on: data.starts_on ?? null,
      ends_on: data.ends_on ?? null,
      timezone: data.timezone ?? null,
      restricted: data.restricted ?? false,
      availability_evidence: data.availability_evidence ?? false,
    }
    const record = await tx.resourceRecord.upsert({
      where: {
        scope_source_id_external_id_kind: {
          scope,
          source_id: sourceId,
          external_id: input.external_id,
          kind: input.kind,
        },
      },
      create: {
        ...update,
        scope,
        tenant_id: scope === 'PUBLIC' ? null : scope,
        source_id: sourceId,
        calculated_status: calculatedStatus(update as any),
        collected_at: now,
        last_success_at: now,
      } as Prisma.ResourceRecordUncheckedCreateInput,
      update: {
        ...update,
        calculated_status: calculatedStatus(update as any),
        last_success_at: now,
      } as Prisma.ResourceRecordUncheckedUpdateInput,
    })
    await tx.resourceRequirement.deleteMany({ where: { record_id: record.id } })
    if (requirements.length)
      await tx.resourceRequirement.createMany({
        data: requirements.map((r: any) => ({ record_id: record.id, ...r })),
      })
    if (project)
      await tx.resourceFundedProject.upsert({
        where: { record_id: record.id },
        create: { record_id: record.id, ...project },
        update: project,
      })
    if (funder) {
      const { meaning, amount, ...identity } = funder
      const f = await tx.resourceFunder.upsert({
        where: { source_id_external_id: { source_id: sourceId, external_id: funder.external_id } },
        create: { source_id: sourceId, ...identity },
        update: identity,
      })
      await tx.resourceFundingEvidence.upsert({
        where: { record_id_funder_id: { record_id: record.id, funder_id: f.id } },
        create: { record_id: record.id, funder_id: f.id, meaning, amount },
        update: { meaning, amount },
      })
    }
    return record
  }

  async connectors() {
    const rows = await this.prisma.resourceConnector.findMany({
      include: { source: true, runs: { orderBy: { started_at: 'desc' }, take: 10 } },
    })
    return rows.map((r) => ({
      ...r,
      credentials_configured:
        r.source_id === 'PROSAS'
          ? !!process.env.PROSAS_CLIENT_ID && !!process.env.PROSAS_CLIENT_SECRET
          : null,
    }))
  }
  async configure(id: string, data: any) {
    const connector = await this.prisma.resourceConnector.findUnique({ where: { id } })
    if (!connector) throw new NotFoundException('Conector não encontrado.')
    if (
      connector.source_id === 'PROSAS' &&
      data.enabled &&
      (!process.env.PROSAS_CLIENT_ID ||
        !process.env.PROSAS_CLIENT_SECRET ||
        process.env.PROSAS_ACCESS_CONFIRMED !== 'true' ||
        !(process.env.PROSAS_SCOPES ?? '').split(' ').includes('confidential:processos.read'))
    )
      throw new BadRequestException(
        'Prosas exige credenciais no servidor, escopo processos.read e confirmação do acesso autorizado.',
      )
    const result = await this.prisma.resourceConnector.updateMany({
      where: { id, status: { not: 'RUNNING' } },
      data: { ...data, ...(data.page_size ? { cursor: 0 } : {}), next_sync_at: new Date() },
    })
    if (!result.count) throw new ConflictException('Aguarde a sincronização em andamento.')
    return this.prisma.resourceConnector.findUnique({ where: { id } })
  }

  async sync(id: string) {
    const c = await this.prisma.resourceConnector.findUnique({ where: { id } })
    if (!c) throw new NotFoundException('Conector não encontrado.')
    if (!c.enabled)
      throw new BadRequestException(
        'Conector desabilitado. Consulte as limitações e configure antes de sincronizar.',
      )
    const now = new Date()
    const lease = await this.prisma.resourceConnector.updateMany({
      where: { id, OR: [{ status: { not: 'RUNNING' } }, { lease_until: { lt: now } }] },
      data: {
        status: 'RUNNING',
        lease_until: new Date(Date.now() + 10 * 60000),
        last_attempt_at: now,
      },
    })
    if (!lease.count) throw new ConflictException('Sincronização já em execução.')
    // Close abandoned runs only after atomically acquiring the expired lease.
    await this.prisma.resourceSyncRun.updateMany({
      where: { connector_id: id, status: 'RUNNING' },
      data: { status: 'FAILED', finished_at: now, error: 'PROCESSO_INTERROMPIDO' },
    })
    const run = await this.prisma.resourceSyncRun.create({
      data: { connector_id: id, cursor_start: c.cursor, cursor_end: c.cursor },
    })
    setImmediate(() => void this.execute(c, run.id).catch(() => undefined))
    return run
  }

  async execute(c: any, runId: string) {
    let cursor = c.cursor,
      processed = 0,
      pages = 0,
      complete = false
    try {
      const reference = await this.client.metadata(c.source_id)
      for (; pages < c.max_pages && !complete; ) {
        const page = await this.client.page(c.source_id, cursor, c.page_size, reference)
        await this.prisma.$transaction(
          async (tx) => {
            for (const row of page.records) await this.persist(c.source_id, row, 'PUBLIC', tx)
            await tx.resourceConnector.update({
              where: { id: c.id },
              data: {
                cursor: page.complete ? 0 : page.next,
                lease_until: new Date(Date.now() + 10 * 60000),
              },
            })
            await tx.resourceSyncRun.update({
              where: { id: runId },
              data: {
                cursor_end: page.complete ? 0 : page.next,
                pages: pages + 1,
                processed: processed + page.records.length,
              },
            })
          },
          { timeout: 60000 },
        )
        processed += page.records.length
        pages++
        complete = page.complete
        cursor = page.complete ? 0 : page.next
      }
      await this.prisma.$transaction([
        this.prisma.resourceSyncRun.update({
          where: { id: runId },
          data: { status: complete ? 'SUCCESS' : 'PARTIAL', finished_at: new Date() },
        }),
        this.prisma.resourceConnector.update({
          where: { id: c.id },
          data: {
            status: 'READY',
            last_success_at: new Date(),
            last_error: null,
            lease_until: null,
            next_sync_at: new Date(Date.now() + (complete ? c.interval_hours * 3600000 : 60000)),
          },
        }),
      ])
    } catch (error) {
      // Never retain response bodies, tokens, SQL parameters, or personal data in logs.
      const code =
        error instanceof SourceError
          ? error.code
          : error instanceof Error && error.message.startsWith('SCHEMA:')
            ? 'SCHEMA_INVALIDO'
            : 'FALHA_INTERNA_NA_SINCRONIZACAO'
      await this.prisma.$transaction([
        this.prisma.resourceSyncRun.update({
          where: { id: runId },
          data: { status: 'FAILED', error: code, finished_at: new Date() },
        }),
        this.prisma.resourceConnector.update({
          where: { id: c.id },
          data: {
            status: 'ERROR',
            last_error: code,
            lease_until: null,
            next_sync_at: new Date(Date.now() + c.interval_hours * 3600000),
          },
        }),
      ])
    }
  }
  async runDue() {
    if (this.ticking) return
    this.ticking = true
    try {
      const rows = await this.prisma.resourceConnector.findMany({
        where: {
          enabled: true,
          OR: [
            { next_sync_at: { lte: new Date() } },
            { status: 'RUNNING', lease_until: { lt: new Date() } },
          ],
        },
        take: 5,
      })
      for (const c of rows) await this.sync(c.id).catch(() => undefined)
    } catch {
      /* Migration and DB availability are reported by standard health monitoring. */
    } finally {
      this.ticking = false
    }
  }
}
