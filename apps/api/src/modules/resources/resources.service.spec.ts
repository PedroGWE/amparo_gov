import { ResourcesService } from './resources.service'
import { ResourcesClient, SourceError } from './resources.client'
import { ResourcesController } from './resources.controller'
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator'

describe('Tenant and user boundaries', () => {
  const record = {
    id: 'r',
    kind: 'OPORTUNIDADE',
    availability_evidence: false,
    starts_on: null,
    ends_on: null,
    timezone: null,
    restricted: false,
    last_success_at: new Date(),
    requirements: [],
  }
  function setup() {
    const db: any = {
      resourceRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      resourceOrganization: { findUnique: jest.fn().mockResolvedValue(null) },
      resourceFavorite: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      },
    }
    return { db, service: new ResourcesService(db, new ResourcesClient()) }
  }
  it('scopes every detail and disallows favorites for an invisible record', async () => {
    const { db, service } = setup()
    await expect(
      service.favorite('tenant-A', 'user-A', 'private-B', { stage: 'IDENTIFICADA' }),
    ).rejects.toThrow('Registro não encontrado')
    expect(db.resourceFavorite.upsert).not.toHaveBeenCalled()
    expect(db.resourceRecord.findFirst.mock.calls[0][0].where).toEqual({
      AND: [
        {
          OR: [
            { scope: 'PUBLIC', tenant_id: null },
            { scope: 'tenant-A', tenant_id: 'tenant-A' },
          ],
        },
        { id: 'private-B' },
      ],
    })
  })
  it('scopes favorites and deletion to both current tenant and authenticated user', async () => {
    const { db, service } = setup()
    await service.favorites('tenant-A', 'user-A')
    expect(db.resourceFavorite.findMany.mock.calls[0][0].where).toMatchObject({
      tenant_id: 'tenant-A',
      user_id: 'user-A',
    })
    await service.unfavorite('tenant-A', 'user-A', 'r')
    expect(db.resourceFavorite.deleteMany).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-A', user_id: 'user-A', record_id: 'r' },
    })
    await service.removeManual('tenant-A', 'r')
    expect(db.resourceRecord.deleteMany).toHaveBeenCalledWith({
      where: { id: 'r', tenant_id: 'tenant-A', scope: 'tenant-A', origin: 'CADASTRO_MANUAL' },
    })
  })
  it('does not expose minimized original payloads through the detail API', async () => {
    const { db, service } = setup()
    db.resourceRecord.findFirst.mockResolvedValue({
      ...record,
      scope: 'PUBLIC',
      raw_data: { audit: 'only' },
      source: null,
    })
    expect(await service.detail('tenant-A', 'r')).not.toHaveProperty('raw_data')
  })
  it('requires global admin permission for global connector mutation', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ResourcesController.prototype.configure)).toEqual([
      '*',
    ])
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ResourcesController.prototype.sync)).toEqual(['*'])
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ResourcesController.prototype.manual)).toEqual([
      'editais:manage',
    ])
  })
})

describe('Failure preservation', () => {
  it('retains existing data and successful timestamp on source failure while recording a sanitized error', async () => {
    const db: any = {
      resourceRecord: { deleteMany: jest.fn() },
      resourceConnector: { update: jest.fn().mockResolvedValue({}) },
      resourceSyncRun: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockResolvedValue([]),
    }
    const client: any = { metadata: jest.fn().mockRejectedValue(new SourceError('HTTP_503')) }
    await new ResourcesService(db, client).execute(
      {
        id: 'BNDES',
        source_id: 'BNDES',
        cursor: 0,
        max_pages: 1,
        page_size: 100,
        interval_hours: 24,
      },
      'run',
    )
    expect(db.resourceRecord.deleteMany).not.toHaveBeenCalled()
    expect(db.resourceConnector.update.mock.calls[0][0].data).toMatchObject({
      status: 'ERROR',
      last_error: 'HTTP_503',
    })
    expect(db.resourceConnector.update.mock.calls[0][0].data).not.toHaveProperty('last_success_at')
    expect(db.resourceSyncRun.update.mock.calls[0][0].data).toMatchObject({
      status: 'FAILED',
      error: 'HTTP_503',
    })
  })
})
