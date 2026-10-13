import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { ApplyEnrollmentDto, SaveClassDto, UpdateClassDto } from './dto/enrollment.dto'
import { EnrollmentService } from './enrollment.service'

@Controller('enrollment')
export class EnrollmentController {
  constructor(private enrollment: EnrollmentService) {}

  @Public()
  @Get(':slug/classes')
  publicClasses(@Param('slug') slug: string) {
    return this.enrollment.publicClasses(slug)
  }

  @Public()
  @Post(':slug/apply')
  apply(@Param('slug') slug: string, @Body() dto: ApplyEnrollmentDto) {
    return this.enrollment.apply(slug, dto)
  }
}

@Controller('enrollment-admin')
@RequirePermissions('turmas:manage')
export class EnrollmentAdminController {
  constructor(private enrollment: EnrollmentService) {}

  @Get('classes')
  classes(@CurrentUser('tenantId') tenantId: string) {
    return this.enrollment.adminClasses(tenantId)
  }

  @Post('classes')
  createClass(@CurrentUser('tenantId') tenantId: string, @Body() dto: SaveClassDto) {
    return this.enrollment.createClass(tenantId, dto)
  }

  @Patch('classes/:id')
  updateClass(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string, @Body() dto: UpdateClassDto) {
    return this.enrollment.updateClass(tenantId, id, dto)
  }

  @Get('classes/:id/enrollments')
  classEnrollments(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.enrollment.classEnrollments(tenantId, id)
  }

  @Post('classes/:id/students/:studentId')
  enrollExisting(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.enrollment.enrollExisting(tenantId, id, studentId)
  }

  @Post('enrollments/:id/close')
  closeEnrollment(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.enrollment.closeEnrollment(tenantId, id)
  }
}
