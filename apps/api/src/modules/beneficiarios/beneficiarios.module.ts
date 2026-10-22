import { Module } from '@nestjs/common'
import { BeneficiariosController } from './beneficiarios.controller'
import { BeneficiariosService } from './beneficiarios.service'
import { DocumentsModule } from '../documents/documents.module'

@Module({
  imports: [DocumentsModule],
  controllers: [BeneficiariosController],
  providers: [BeneficiariosService],
  exports: [BeneficiariosService],
})
export class BeneficiariosModule {}
