import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { ProjectManagementService } from './project-management.service'
import { CreateProjectClassDto, CreateProjectRoutineDto, LinkProjectStudentDto, SaveProjectAttendanceDto } from './dto/project-management.dto'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { QueryProjectsDto } from './dto/query-projects.dto'
import { CreatePhaseDto } from './dto/create-phase.dto'
import { CreateTaskDto } from './dto/create-task.dto'
import { UpdateTaskDto } from './dto/update-task.dto'
import { AddMemberDto } from './dto/add-member.dto'
import { CreateProjectIndicatorDto } from './dto/create-project-indicator.dto'
import { UpdateProjectIndicatorDto } from './dto/update-project-indicator.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import type { JwtPayload } from '../auth/types/jwt-payload'

@Controller('projects')
export class ProjectsController {
  constructor(private projects: ProjectsService, private management: ProjectManagementService) {}

  // ── Projects ──────────────────────────────────────────────────

  @Get('overview')
  overview(@CurrentUser('tenantId') tid: string) {
    return this.projects.overview(tid)
  }

  @Get()
  findAll(@CurrentUser('tenantId') tid: string, @Query() q: QueryProjectsDto) {
    return this.projects.findAll(tid, q)
  }

  @Post()
  @RequirePermissions('projects:create')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.tenantId, user.sub, dto)
  }

  @Get(':id')
  findOne(@CurrentUser('tenantId') tid: string, @Param('id') id: string) {
    return this.projects.findOne(tid, id)
  }

  @Get(':id/management')
  managementDashboard(@CurrentUser('tenantId') tid: string, @Param('id') id: string) {
    return this.management.dashboard(tid, id)
  }

  @Get(':id/students/search')
  searchStudents(@CurrentUser('tenantId') tid: string, @Param('id') id: string, @Query('q') q = '') {
    return this.management.searchStudents(tid, id, q)
  }

  @Post(':id/students')
  @RequirePermissions('projects:update')
  linkStudent(@CurrentUser('tenantId') tid: string, @Param('id') id: string, @Body() dto: LinkProjectStudentDto) {
    return this.management.linkStudent(tid, id, dto.beneficiary_id)
  }

  @Delete(':id/students/:studentId')
  @RequirePermissions('projects:update')
  unlinkStudent(@CurrentUser('tenantId') tid: string, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.management.unlinkStudent(tid, id, studentId)
  }

  @Post(':id/classes')
  @RequirePermissions('projects:update')
  createClass(@CurrentUser('tenantId') tid: string, @Param('id') id: string, @Body() dto: CreateProjectClassDto) {
    return this.management.createClass(tid, id, dto)
  }

  @Post(':id/classes/:classId/students/:studentId')
  @RequirePermissions('projects:update')
  enrollStudent(@CurrentUser('tenantId') tid: string, @Param('id') id: string, @Param('classId') classId: string, @Param('studentId') studentId: string) {
    return this.management.enrollStudent(tid, id, classId, studentId)
  }

  @Get(':id/classes/:classId/attendance')
  attendance(@CurrentUser('tenantId') tid: string, @Param('id') id: string, @Param('classId') classId: string, @Query('date') date: string) {
    return this.management.attendance(tid, id, classId, date)
  }

  @Post(':id/classes/:classId/attendance')
  @RequirePermissions('projects:update')
  saveAttendance(@CurrentUser('tenantId') tid: string, @Param('id') id: string, @Param('classId') classId: string, @Body() dto: SaveProjectAttendanceDto) {
    return this.management.saveAttendance(tid, id, classId, dto)
  }

  @Post(':id/classes/:classId/routine')
  @RequirePermissions('projects:update')
  createRoutine(@CurrentUser('tenantId') tid: string, @Param('id') id: string, @Param('classId') classId: string, @Body() dto: CreateProjectRoutineDto) {
    return this.management.createRoutine(tid, id, classId, dto)
  }

  @Patch(':id')
  @RequirePermissions('projects:update')
  update(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(tid, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('projects:delete')
  remove(@CurrentUser('tenantId') tid: string, @Param('id') id: string) {
    return this.projects.remove(tid, id)
  }

  // ── Phases ────────────────────────────────────────────────────

  @Get(':id/phases')
  findPhases(@CurrentUser('tenantId') tid: string, @Param('id') id: string) {
    return this.projects.findPhases(tid, id)
  }

  @Post(':id/phases')
  @RequirePermissions('projects:update')
  createPhase(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Body() dto: CreatePhaseDto,
  ) {
    return this.projects.createPhase(tid, id, dto)
  }

  @Patch(':id/phases/:phaseId')
  @RequirePermissions('projects:update')
  updatePhase(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Param('phaseId') phaseId: string,
    @Body() dto: Partial<CreatePhaseDto>,
  ) {
    return this.projects.updatePhase(tid, id, phaseId, dto)
  }

  @Delete(':id/phases/:phaseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('projects:update')
  removePhase(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Param('phaseId') phaseId: string,
  ) {
    return this.projects.removePhase(tid, id, phaseId)
  }

  // ── Tasks ─────────────────────────────────────────────────────

  @Get(':id/tasks')
  findTasks(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Query('phaseId') phaseId?: string,
    @Query('status') status?: string,
  ) {
    return this.projects.findTasks(tid, id, { phaseId, status })
  }

  @Post(':id/tasks')
  @RequirePermissions('projects:update')
  createTask(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.projects.createTask(tid, id, dto)
  }

  @Patch(':id/tasks/:taskId')
  @RequirePermissions('projects:update')
  updateTask(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.projects.updateTask(tid, id, taskId, dto)
  }

  // ── Members ───────────────────────────────────────────────────

  @Get(':id/members')
  findMembers(@CurrentUser('tenantId') tid: string, @Param('id') id: string) {
    return this.projects.findMembers(tid, id)
  }

  @Post(':id/members')
  @RequirePermissions('projects:update')
  addMember(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.projects.addMember(tid, id, dto)
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('projects:update')
  removeMember(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.projects.removeMember(tid, id, userId)
  }

  // ── Social impact indicators ───────────────────────────────────

  @Get(':id/indicators')
  findIndicators(@CurrentUser('tenantId') tid: string, @Param('id') id: string) {
    return this.projects.findIndicators(tid, id)
  }

  @Post(':id/indicators')
  @RequirePermissions('projects:update')
  createIndicator(@CurrentUser('tenantId') tid: string, @Param('id') id: string, @Body() dto: CreateProjectIndicatorDto) {
    return this.projects.createIndicator(tid, id, dto)
  }

  @Patch(':id/indicators/:indicatorId')
  @RequirePermissions('projects:update')
  updateIndicator(@CurrentUser('tenantId') tid: string, @Param('id') id: string, @Param('indicatorId') indicatorId: string, @Body() dto: UpdateProjectIndicatorDto) {
    return this.projects.updateIndicator(tid, id, indicatorId, dto)
  }
}
