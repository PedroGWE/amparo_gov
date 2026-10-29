import { Module } from '@nestjs/common'
import { EducaModule } from './modules/educa/educa.module'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import envConfig from './config/env'
import { PrismaModule } from './modules/prisma/prisma.module'
import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { TenantsModule } from './modules/tenants/tenants.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { FinancialModule } from './modules/financial/financial.module'
import { DocumentsModule } from './modules/documents/documents.module'
import { OrganizationProfileModule } from './modules/organization-profile/organization-profile.module'
import { EditaisModule } from './modules/editais/editais.module'
import { BeneficiariosModule } from './modules/beneficiarios/beneficiarios.module'
import { ProfessoresModule } from './modules/professores/professores.module'
import { ConectaModule } from './modules/conecta/conecta.module'
import { ReportsModule } from './modules/reports/reports.module'
import { PartnershipsModule } from './modules/partnerships/partnerships.module'
import { AccountabilityModule } from './modules/accountability/accountability.module'
import { TransferegovModule } from './modules/transferegov/transferegov.module'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { RolesGuard } from './common/guards/roles.guard'
import { PublicDataModule } from './modules/public-data/public-data.module'
import { InventoryModule } from './modules/inventory/inventory.module'
import { EnrollmentModule } from './modules/enrollment/enrollment.module'
import { ResourcesModule } from './modules/resources/resources.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'], load: [envConfig] }),
    PrismaModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    ProjectsModule,
    FinancialModule,
    DocumentsModule,
    OrganizationProfileModule,
    EditaisModule,
    BeneficiariosModule,
    ProfessoresModule,
    ConectaModule,
    EducaModule,
    ReportsModule,
    PartnershipsModule,
    AccountabilityModule,
    TransferegovModule,
    PublicDataModule,
    InventoryModule,
    EnrollmentModule,
    ResourcesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
