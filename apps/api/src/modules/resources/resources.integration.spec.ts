import 'reflect-metadata'
import { Test } from '@nestjs/testing'
import { APP_GUARD } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaService } from '../prisma/prisma.service'
import { JwtStrategy } from '../auth/strategies/jwt.strategy'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { ResourcesController } from './resources.controller'
import { ResourcesService } from './resources.service'
import { ResourcesClient } from './resources.client'

const url = process.env.RESOURCE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('Resources: PostgreSQL + Fastify + real JWT guards (isolated test DB)', () => {
  let app: NestFastifyApplication, prisma: PrismaService, service: ResourcesService
  let tenantA: string, tenantB: string, userA: string, userA2: string, userB: string
  let id: string
  const jwt = new JwtService({ secret: 'resource-integration-test-only-secret' })
  const headers = (tenantId: string, sub: string, permissions = ['editais:manage']) => ({
    authorization: `Bearer ${jwt.sign({ tenantId, sub, permissions }, { expiresIn: '5m' })}`,
  })
  const fixture = {
    source_id: 'MANUAL',
    external_id: 'explicit-test-fixture',
    title: 'Demonstração fictícia exclusiva de teste',
    source_url: 'https://www.gov.br/fixture-de-teste',
    kind: 'OPORTUNIDADE',
    official_status: 'Inscrições abertas (fixture)',
    availability_evidence: true,
    timezone: 'America/Sao_Paulo',
    starts_on: '2020-01-01',
    ends_on: '2099-12-31',
    eligible_profiles: ['OSC'],
    territories: ['SP'],
    theme: 'Educação',
    funder_name: 'Financiador fictício de teste',
    requirements: [
      {
        field: 'applicant_type',
        operator: 'IN',
        value: ['OSC'],
        evidence: 'Fixture: participação exclusiva de OSC',
      },
    ],
  }
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.includes('test'))
      throw new Error('Use exclusivamente um banco de testes com test no nome.')
    process.env.RESOURCES_SCHEDULER_ENABLED = 'false'
    prisma = new PrismaService({ datasources: { db: { url } } })
    await prisma.$connect()
    const suffix = Date.now()
    const a = await prisma.tenant.create({
      data: { slug: `resource-test-a-${suffix}`, name: 'Organização A de teste', type: 'OSC' },
    })
    const b = await prisma.tenant.create({
      data: { slug: `resource-test-b-${suffix}`, name: 'Organização B de teste', type: 'EMPRESA' },
    })
    tenantA = a.id
    tenantB = b.id
    const createUser = (tenant_id: string, email: string) =>
      prisma.user.create({
        data: {
          tenant_id,
          email,
          name: 'Usuário fictício de teste',
          password_hash: 'not-a-real-password',
        },
      })
    userA = (await createUser(tenantA, 'a@example.test')).id
    userA2 = (await createUser(tenantA, 'a2@example.test')).id
    userB = (await createUser(tenantB, 'b@example.test')).id
    process.env.RESOURCES_ADMIN_USER_IDS = userA
    const module = await Test.createTestingModule({
      controllers: [ResourcesController],
      providers: [
        ResourcesService,
        ResourcesClient,
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: () => 'resource-integration-test-only-secret' },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile()
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    )
    app.setGlobalPrefix('api/v1')
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    service = module.get(ResourcesService)
  }, 30000)
  afterAll(async () => {
    if (app) await app.close()
    if (prisma) {
      // Remove only the tenants created by this test run; public catalog is retained in the test DB.
      await prisma.user.deleteMany({
        where: { tenant_id: { in: [tenantA, tenantB].filter(Boolean) } },
      })
      await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB].filter(Boolean) } } })
      await prisma.$disconnect()
    }
  })
  const request = (
    method: any,
    path: string,
    payload?: any,
    auth: Record<string, string> = headers(tenantA, userA),
  ) => app.inject({ method, url: '/api/v1/resources' + path, headers: auth, payload })

  it('rejects unauthenticated requests and non-admin global mutations', async () => {
    expect((await request('GET', '/dashboard', undefined, {})).statusCode).toBe(401)
    expect((await request('PATCH', '/admin/connectors/BNDES', { enabled: false })).statusCode).toBe(
      403,
    )
    expect(
      (await request('POST', '/manual', fixture, headers(tenantA, userA, []))).statusCode,
    ).toBe(403)
  })
  it('requires server operator authorization in addition to tenant admin permission', async () => {
    expect(
      (await request('GET', '/admin/connectors', undefined, headers(tenantB, userB, ['*'])))
        .statusCode,
    ).toBe(403)
    expect(
      (await request('GET', '/admin/connectors', undefined, headers(tenantA, userA, ['*'])))
        .statusCode,
    ).toBe(200)
    expect(
      (
        await request(
          'PATCH',
          '/admin/connectors/BNDES',
          { interval_hours: 24 },
          headers(tenantA, userA, ['*']),
        )
      ).statusCode,
    ).toBe(200)
  })
  it('imports twice without duplicating and preserves initial collection timestamp', async () => {
    const first = await request('POST', '/manual/import', [fixture])
    expect(first.statusCode).toBe(201)
    id = first.json().ids[0]
    const before = await prisma.resourceRecord.findUniqueOrThrow({ where: { id } })
    const second = await request('POST', '/manual/import', [fixture])
    expect(second.statusCode).toBe(201)
    expect(second.json().ids).toEqual([id])
    const after = await prisma.resourceRecord.findUniqueOrThrow({ where: { id } })
    expect(after.collected_at).toEqual(before.collected_at)
    expect(
      await prisma.resourceRecord.count({
        where: { scope: tenantA, external_id: fixture.external_id },
      }),
    ).toBe(1)
  })
  it('applies keyword, theme, territory, profile, funder and open-window filters', async () => {
    const matching = await request(
      'GET',
      '/search?view=available&q=Demonstra%C3%A7%C3%A3o&theme=Educa&territory=SP&profile=OSC&funder=fict%C3%ADcio',
    )
    expect(matching.statusCode).toBe(200)
    expect(matching.json().data.map((r: any) => r.id)).toContain(id)
    expect(
      (await request('GET', '/search?view=available&profile=EMPRESA'))
        .json()
        .data.map((r: any) => r.id),
    ).not.toContain(id)
  })
  it('prevents detail/search/favorites/import tenant injection across organizations', async () => {
    const other = headers(tenantB, userB)
    expect((await request('GET', '/' + id, undefined, other)).statusCode).toBe(404)
    expect(
      (await request('PUT', '/favorites/' + id, { stage: 'IDENTIFICADA' }, other)).statusCode,
    ).toBe(404)
    expect(
      (await request('GET', '/search?view=catalog', undefined, other))
        .json()
        .data.map((r: any) => r.id),
    ).not.toContain(id)
    expect((await request('POST', '/manual', { ...fixture, tenant_id: tenantB })).statusCode).toBe(
      400,
    )
    expect((await request('DELETE', '/manual/' + id, undefined, other)).statusCode).toBe(404)
  })
  it('keeps favorites and notes scoped to each authenticated user', async () => {
    expect(
      (
        await request('PUT', '/favorites/' + id, {
          stage: 'EM_PREPARACAO',
          notes: 'Nota privada de teste',
        })
      ).statusCode,
    ).toBe(200)
    expect((await request('GET', '/favorites')).json()).toHaveLength(1)
    expect(
      (await request('GET', '/favorites', undefined, headers(tenantA, userA2))).json(),
    ).toEqual([])
    const r = await request('GET', '/favorites')
    expect(r.json()[0]).toMatchObject({ stage: 'EM_PREPARACAO', notes: 'Nota privada de teste' })
    expect((await request('PUT', '/favorites/' + id, { stage: 'APROVADA' })).statusCode).toBe(400)
  })
  it('compares the persisted organizational profile and supplies the evidence', async () => {
    const p = {
      name: 'Organização de teste',
      applicant_type: 'EMPRESA',
      legal_nature: null,
      uf: 'SP',
      city: null,
      founded_on: '2020-01-01',
      themes: ['Educação'],
      territorial_scope: null,
    }
    expect((await request('PUT', '/organization', p)).statusCode).toBe(200)
    const r = (await request('GET', '/' + id)).json()
    expect(r.compatibility.status).toBe('INCOMPATIVEL')
    expect(r.compatibility.checks[0].used).toBe('EMPRESA')
    expect(r).not.toHaveProperty('raw_data')
    expect(
      (await request('GET', '/organization', undefined, headers(tenantB, userB))).json()
        .applicant_type,
    ).toBeNull()
  })
  it('separates financed records, public transfers, expired calls and unsupported fields', async () => {
    for (const [external_id, kind, ends_on] of [
      ['funded', 'PROJETO_FINANCIADO', '2099-12-31'],
      ['public', 'TRANSFERENCIA_PUBLICA', '2099-12-31'],
      ['closed', 'OPORTUNIDADE', '2020-12-31'],
    ] as const) {
      expect(
        (await request('POST', '/manual', { ...fixture, external_id, kind, ends_on })).statusCode,
      ).toBe(201)
    }
    const open = (await request('GET', '/search?view=available'))
      .json()
      .data.filter((r: any) => r.origin === 'CADASTRO_MANUAL')
    expect(open).toHaveLength(1)
    const history = (await request('GET', '/search?view=history')).json().data
    expect(history.some((r: any) => r.external_id === 'funded')).toBe(true)
    expect(history.every((r: any) => r.calculated_status === 'HISTORICO')).toBe(true)
    expect(
      (await request('GET', '/search?view=public'))
        .json()
        .data.some((r: any) => r.external_id === 'public'),
    ).toBe(true)
    expect(
      (
        await request('POST', '/manual', {
          ...fixture,
          external_id: 'missing-fields',
          availability_evidence: false,
          starts_on: null,
          ends_on: null,
          official_status: null,
        })
      ).statusCode,
    ).toBe(201)
    expect(
      (await request('GET', '/search?view=available'))
        .json()
        .data.some((r: any) => r.external_id === 'missing-fields'),
    ).toBe(false)
  })
  it('rolls back an invalid batch and guards source domains', async () => {
    expect(
      (
        await request('POST', '/manual/import', [
          fixture,
          { ...fixture, external_id: 'bad', source_url: 'http://internal' },
        ])
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await request('POST', '/manual', {
          ...fixture,
          source_id: 'PETROBRAS',
          source_url: 'https://example.test',
        })
      ).statusCode,
    ).toBe(400)
  })
  it('uses PostgreSQL constraints to prevent invalid catalog ownership', async () => {
    await expect(
      prisma.resourceRecord.create({
        data: {
          scope: 'PUBLIC',
          tenant_id: tenantA,
          source_id: 'MANUAL',
          external_id: 'bad-scope',
          kind: 'OPORTUNIDADE',
          origin: 'TEST',
          source_url: 'https://www.gov.br',
        },
      }),
    ).rejects.toThrow()
  })

  const live = process.env.RESOURCE_LIVE_TEST === 'true' ? it : it.skip
  live(
    'collects real Transferegov and BNDES pages twice idempotently through the backend',
    async () => {
      for (const source of ['TG_DISCRICIONARIAS', 'TG_PARCERIAS', 'BNDES']) {
        const connector = {
          id: source,
          source_id: source,
          cursor: 0,
          max_pages: 1,
          page_size: 2,
          interval_hours: 24,
        }
        const collect = async () => {
          const run = await prisma.resourceSyncRun.create({ data: { connector_id: source } })
          await service.execute(connector, run.id)
          const finished = await prisma.resourceSyncRun.findUniqueOrThrow({ where: { id: run.id } })
          expect(['SUCCESS', 'PARTIAL']).toContain(finished.status)
          expect(finished.processed).toBeGreaterThan(0)
          return finished
        }
        const first = await collect()
        const count = await prisma.resourceRecord.count({
          where: { scope: 'PUBLIC', source_id: source },
        })
        await collect()
        expect(
          await prisma.resourceRecord.count({ where: { scope: 'PUBLIC', source_id: source } }),
        ).toBe(count)
        console.info(
          `Fonte real ${source}: ${first.processed} linhas, ${count} registros únicos após duas sincronizações.`,
        )
      }
    },
    180000,
  )
})
