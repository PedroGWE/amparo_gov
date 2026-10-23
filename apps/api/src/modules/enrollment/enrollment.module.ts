import { Module } from '@nestjs/common'
import { EnrollmentAdminController, EnrollmentController } from './enrollment.controller'
import { EnrollmentService } from './enrollment.service'
import { CoursesService } from './courses.service'

@Module({ controllers: [EnrollmentController, EnrollmentAdminController], providers: [EnrollmentService, CoursesService] })
export class EnrollmentModule {}
