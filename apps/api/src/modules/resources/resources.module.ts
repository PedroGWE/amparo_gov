import { Module } from '@nestjs/common'
import { ResourcesController } from './resources.controller'
import { ResourcesService } from './resources.service'
import { ResourcesClient } from './resources.client'
@Module({ controllers: [ResourcesController], providers: [ResourcesService, ResourcesClient] })
export class ResourcesModule {}
