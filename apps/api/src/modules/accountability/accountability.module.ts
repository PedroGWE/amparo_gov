import { Module } from '@nestjs/common'
import { AccountabilityController, FiscalWebhookController } from './accountability.controller'
import { AccountabilityService } from './accountability.service'
import { FiscalNotesService } from './fiscal-notes.service'
import { FocusNfseClient } from './focus-nfse.client'
import { DocumentsModule } from '../documents/documents.module'
import { MonthlyController } from './monthly.controller'
import { MonthlyService } from './monthly.service'
import { MonthlyDocumentsService } from './monthly-documents.service'

@Module({ imports: [DocumentsModule], controllers: [AccountabilityController, FiscalWebhookController, MonthlyController], providers: [AccountabilityService, FiscalNotesService, FocusNfseClient, MonthlyService, MonthlyDocumentsService] })
export class AccountabilityModule {}
