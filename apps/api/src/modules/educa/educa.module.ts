import { Module } from '@nestjs/common'
import { EducaController } from './educa.controller'
import { EducaService } from './educa.service'
@Module({ controllers: [EducaController], providers: [EducaService] })
export class EducaModule {}
