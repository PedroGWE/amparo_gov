import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import type { JwtPayload } from '../auth/types/jwt-payload'
import { CreateInventoryItemDto, InventoryMovementDto, InventoryQueryDto, UpdateInventoryItemDto } from './dto/inventory.dto'
import { InventoryService } from './inventory.service'

@Controller('inventory')
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Get()
  @RequirePermissions('inventory:read')
  list(@CurrentUser('tenantId') tenantId: string, @Query() query: InventoryQueryDto) {
    return this.inventory.list(tenantId, query)
  }

  @Get('summary')
  @RequirePermissions('inventory:read')
  summary(@CurrentUser('tenantId') tenantId: string) {
    return this.inventory.summary(tenantId)
  }

  @Get('movements')
  @RequirePermissions('inventory:read')
  history(@CurrentUser('tenantId') tenantId: string, @Query('itemId') itemId?: string) {
    return this.inventory.history(tenantId, itemId)
  }

  @Post()
  @RequirePermissions('inventory:write')
  create(@CurrentUser('tenantId') tenantId: string, @Body() dto: CreateInventoryItemDto) {
    return this.inventory.create(tenantId, dto)
  }

  @Patch(':id')
  @RequirePermissions('inventory:write')
  update(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string, @Body() dto: UpdateInventoryItemDto) {
    return this.inventory.update(tenantId, id, dto)
  }

  @Post(':id/movements')
  @RequirePermissions('inventory:write')
  move(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: InventoryMovementDto) {
    return this.inventory.move(user.tenantId, user.sub, id, dto)
  }
}
