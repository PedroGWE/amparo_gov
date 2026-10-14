import { Module } from '@nestjs/common'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'
import { ProjectManagementService } from './project-management.service'

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectManagementService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
