import { Module } from '@nestjs/common'
import { EnrollmentAdminController, EnrollmentController } from './enrollment.controller'
import { EnrollmentService } from './enrollment.service'

@Module({ controllers: [EnrollmentController, EnrollmentAdminController], providers: [EnrollmentService] })
export class EnrollmentModule {}
