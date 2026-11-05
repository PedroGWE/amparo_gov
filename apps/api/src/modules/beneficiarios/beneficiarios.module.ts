import { Module } from '@nestjs/common'
import { BeneficiariosController } from './beneficiarios.controller'
import { BeneficiariosService } from './beneficiarios.service'
import { DocumentsModule } from '../documents/documents.module'
import { ProfileInvitesService } from './profile-invites.service'
import { PublicBeneficiaryProfileController } from './beneficiarios.controller'

@Module({
  imports: [DocumentsModule],
  controllers: [BeneficiariosController, PublicBeneficiaryProfileController],
  providers: [BeneficiariosService, ProfileInvitesService],
  exports: [BeneficiariosService],
})
export class BeneficiariosModule {}
