-- AlterTable
ALTER TABLE "educa_aulas" ADD COLUMN     "execution_status" TEXT NOT NULL DEFAULT 'PREVISTA';

-- CreateTable
CREATE TABLE "accountability_instruments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT,
    "grantor_sphere" TEXT,
    "grantor" TEXT,
    "work_plan_document_id" TEXT,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accountability_instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountability_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "fields" JSONB NOT NULL,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "scope" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accountability_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_requirement_rules" (
    "id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "origin" TEXT NOT NULL,
    "source_reference" TEXT,
    "condition" JSONB NOT NULL DEFAULT '{}',
    "applies" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMP(3),
    "blocks_close" BOOLEAN NOT NULL DEFAULT false,
    "responsible_id" TEXT,
    "due_day" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_requirement_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_competences" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "no_movement" BOOLEAN NOT NULL DEFAULT false,
    "no_movement_reason" TEXT,
    "execution_data" JSONB NOT NULL DEFAULT '{}',
    "report_id" TEXT,
    "snapshot" JSONB,
    "snapshot_hash" TEXT,
    "closed_at" TIMESTAMP(3),
    "closed_by" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_competences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_requirements" (
    "id" TEXT NOT NULL,
    "competence_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "applies" BOOLEAN NOT NULL DEFAULT false,
    "justification" TEXT,
    "reviewer_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "evidence_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_team_links" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "professor_id" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "description" TEXT,
    "internal_registration" TEXT,
    "cpf" TEXT,
    "cnpj" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3),
    "weekly_minutes" INTEGER,
    "contracted_unit" TEXT,
    "quantity" DECIMAL(18,3),
    "amount" DECIMAL(18,2),
    "contract_document_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_team_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_point_entries" (
    "id" TEXT NOT NULL,
    "competence_id" TEXT NOT NULL,
    "team_link_id" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "kind" TEXT NOT NULL DEFAULT 'REALIZADO',
    "justification" TEXT,
    "approved_by" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_point_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_generated_documents" (
    "id" TEXT NOT NULL,
    "competence_id" TEXT NOT NULL,
    "template_id" TEXT,
    "kind" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "source_hash" TEXT NOT NULL,
    "signed_document_id" TEXT,
    "signature_state" TEXT NOT NULL DEFAULT 'NAO_ASSINADO',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_events" (
    "id" TEXT NOT NULL,
    "competence_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accountability_instruments_tenant_id_project_id_idx" ON "accountability_instruments"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "accountability_instruments_tenant_id_project_id_number_key" ON "accountability_instruments"("tenant_id", "project_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "accountability_templates_tenant_id_code_version_key" ON "accountability_templates"("tenant_id", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_requirement_rules_instrument_id_code_version_key" ON "monthly_requirement_rules"("instrument_id", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_competences_report_id_key" ON "monthly_competences"("report_id");

-- CreateIndex
CREATE INDEX "monthly_competences_tenant_id_project_id_month_idx" ON "monthly_competences"("tenant_id", "project_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_competences_tenant_id_instrument_id_month_revision_key" ON "monthly_competences"("tenant_id", "instrument_id", "month", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_requirements_competence_id_rule_id_key" ON "monthly_requirements"("competence_id", "rule_id");

-- CreateIndex
CREATE INDEX "monthly_team_links_tenant_id_project_id_instrument_id_idx" ON "monthly_team_links"("tenant_id", "project_id", "instrument_id");

-- CreateIndex
CREATE INDEX "monthly_point_entries_competence_id_team_link_id_start_at_idx" ON "monthly_point_entries"("competence_id", "team_link_id", "start_at");

-- CreateIndex
CREATE INDEX "monthly_generated_documents_competence_id_created_at_idx" ON "monthly_generated_documents"("competence_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_generated_documents_competence_id_kind_format_versi_key" ON "monthly_generated_documents"("competence_id", "kind", "format", "version");

-- CreateIndex
CREATE INDEX "monthly_events_competence_id_created_at_idx" ON "monthly_events"("competence_id", "created_at");

-- AddForeignKey
ALTER TABLE "monthly_requirement_rules" ADD CONSTRAINT "monthly_requirement_rules_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "accountability_instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_competences" ADD CONSTRAINT "monthly_competences_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "accountability_instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_competences" ADD CONSTRAINT "monthly_competences_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "accountability_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_requirements" ADD CONSTRAINT "monthly_requirements_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "monthly_competences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_requirements" ADD CONSTRAINT "monthly_requirements_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "monthly_requirement_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_point_entries" ADD CONSTRAINT "monthly_point_entries_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "monthly_competences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_generated_documents" ADD CONSTRAINT "monthly_generated_documents_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "monthly_competences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_events" ADD CONSTRAINT "monthly_events_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "monthly_competences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
