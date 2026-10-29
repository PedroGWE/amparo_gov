import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { z } from 'zod'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import type { JwtPayload } from '../auth/types/jwt-payload'
import { ResourcesService } from './resources.service'
import {
  connectorSchema,
  favoriteSchema,
  manualSchema,
  organizationSchema,
  querySchema,
} from './resources.domain'

function parse<T>(schema: z.ZodType<T, any, any>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new BadRequestException(result.error.flatten())
  return result.data
}
@Controller('resources')
export class ResourcesController {
  constructor(private readonly service: ResourcesService) {}
  @Get('search') search(@CurrentUser('tenantId') tenant: string, @Query() q: unknown) {
    return this.service.search(tenant, parse(querySchema, q))
  }
  @Get('dashboard') dashboard(@CurrentUser() user: JwtPayload) {
    return this.service.dashboard(user.tenantId, user.sub)
  }
  @Get('organization') profile(@CurrentUser('tenantId') tenant: string) {
    return this.service.profile(tenant)
  }
  @Put('organization') @RequirePermissions('editais:manage') saveProfile(
    @CurrentUser('tenantId') tenant: string,
    @Body() body: unknown,
  ) {
    return this.service.saveProfile(tenant, parse(organizationSchema, body))
  }
  @Get('favorites') favorites(@CurrentUser() user: JwtPayload) {
    return this.service.favorites(user.tenantId, user.sub)
  }
  @Put('favorites/:id') favorite(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.favorite(user.tenantId, user.sub, id, parse(favoriteSchema, body))
  }
  @Delete('favorites/:id') unfavorite(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.unfavorite(user.tenantId, user.sub, id)
  }
  @Post('manual') @RequirePermissions('editais:manage') manual(
    @CurrentUser('tenantId') tenant: string,
    @Body() body: unknown,
  ) {
    return this.service.manual(tenant, [parse(manualSchema, body)])
  }
  @Post('manual/import') @RequirePermissions('editais:manage') import(
    @CurrentUser('tenantId') tenant: string,
    @Body() body: unknown,
  ) {
    return this.service.manual(tenant, parse(z.array(manualSchema).min(1).max(200), body))
  }
  @Delete('manual/:id') @RequirePermissions('editais:manage') remove(
    @CurrentUser('tenantId') tenant: string,
    @Param('id') id: string,
  ) {
    return this.service.removeManual(tenant, id)
  }
  // '*' is tenant-scoped in this system. Shared catalog administration also needs
  // an operator allowlist configured exclusively on the server.
  @Get('admin/connectors') @RequirePermissions('*') connectors(@CurrentUser() user: JwtPayload) {
    this.service.assertGlobalAdmin(user.sub)
    return this.service.connectors()
  }
  @Patch('admin/connectors/:id') @RequirePermissions('*') configure(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.service.assertGlobalAdmin(user.sub)
    return this.service.configure(id, parse(connectorSchema, body))
  }
  @Post('admin/connectors/:id/sync') @RequirePermissions('*') sync(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    this.service.assertGlobalAdmin(user.sub)
    return this.service.sync(id)
  }
  @Get(':id') detail(@CurrentUser('tenantId') tenant: string, @Param('id') id: string) {
    return this.service.detail(tenant, id)
  }
}
