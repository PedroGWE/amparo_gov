import { Module } from '@nestjs/common'
import { EducaController } from './educa.controller'
import { EducaService } from './educa.service'
import { EducaAccessGuard } from './educa-access.guard'
@Module({ controllers: [EducaController], providers: [EducaService, EducaAccessGuard] })
export class EducaModule {}
