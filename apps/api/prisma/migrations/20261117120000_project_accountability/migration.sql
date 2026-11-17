CREATE TABLE "accountability_expenses" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "instrument_id" TEXT NOT NULL, "transaction_id" TEXT NOT NULL,
  "work_plan_version" TEXT, "budget_line" TEXT, "funding_source" TEXT NOT NULL DEFAULT 'PARCERIA',
  "account_reference" TEXT, "scope" TEXT, "classification" TEXT NOT NULL DEFAULT 'REVISAO',
  "classification_basis" TEXT, "documents" JSONB NOT NULL DEFAULT '{}', "release_status" TEXT NOT NULL DEFAULT 'PREPARACAO',
  "released_by" TEXT, "released_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "accountability_expenses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "accountability_expenses_instrument_id_transaction_id_key" ON "accountability_expenses"("instrument_id", "transaction_id");
CREATE INDEX "accountability_expenses_tenant_id_instrument_id_idx" ON "accountability_expenses"("tenant_id", "instrument_id");
ALTER TABLE "accountability_expenses" ADD CONSTRAINT "accountability_expenses_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "accountability_instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "accountability_payments" (
  "id" TEXT NOT NULL, "expense_id" TEXT NOT NULL, "amount" DECIMAL(18,2) NOT NULL, "paid_at" TIMESTAMP(3) NOT NULL,
  "operation_reference" TEXT NOT NULL, "evidence_id" TEXT NOT NULL, "occurrence" BOOLEAN NOT NULL DEFAULT false,
  "justification" TEXT, "statement_id" TEXT, "reconciled_at" TIMESTAMP(3), "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "accountability_payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "accountability_payments_expense_id_operation_reference_key" ON "accountability_payments"("expense_id", "operation_reference");
CREATE UNIQUE INDEX "accountability_payments_statement_id_key" ON "accountability_payments"("statement_id");
ALTER TABLE "accountability_payments" ADD CONSTRAINT "accountability_payments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "accountability_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "monthly_validations" (
  "id" TEXT NOT NULL, "competence_id" TEXT NOT NULL, "stage" TEXT NOT NULL, "status" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL, "role" TEXT NOT NULL, "comment" TEXT, "revision" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "monthly_validations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "monthly_validations_competence_id_stage_created_at_idx" ON "monthly_validations"("competence_id", "stage", "created_at");
ALTER TABLE "monthly_validations" ADD CONSTRAINT "monthly_validations_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "monthly_competences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "official_deliveries" (
  "id" TEXT NOT NULL, "instrument_id" TEXT NOT NULL, "title" TEXT NOT NULL, "period" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'EM_PREPARACAO', "due_at" TIMESTAMP(3), "legal_basis" TEXT, "responsible_id" TEXT,
  "required_documents" JSONB NOT NULL DEFAULT '[]', "protocol_number" TEXT, "protocol_at" TIMESTAMP(3),
  "protocol_evidence_id" TEXT, "package_version" INTEGER, "decision_document_id" TEXT, "history" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "official_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "official_deliveries_instrument_id_period_title_key" ON "official_deliveries"("instrument_id", "period", "title");
ALTER TABLE "official_deliveries" ADD CONSTRAINT "official_deliveries_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "accountability_instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "accountability_indicator_results" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "instrument_id" TEXT NOT NULL, "indicator_id" TEXT NOT NULL,
  "month" TIMESTAMP(3) NOT NULL, "scope" TEXT NOT NULL DEFAULT 'GERAL', "work_plan_version" TEXT NOT NULL,
  "expected" DECIMAL(18,4) NOT NULL, "actual" DECIMAL(18,4), "method" TEXT NOT NULL, "responsible_id" TEXT NOT NULL,
  "evidence_ids" TEXT[] DEFAULT ARRAY[]::TEXT[], "justification" TEXT, "source" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "accountability_indicator_results_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "accountability_indicator_results_instrument_id_indicator_id_month_scope_key" ON "accountability_indicator_results"("instrument_id", "indicator_id", "month", "scope");
CREATE INDEX "accountability_indicator_results_tenant_id_instrument_id_month_idx" ON "accountability_indicator_results"("tenant_id", "instrument_id", "month");
ALTER TABLE "accountability_indicator_results" ADD CONSTRAINT "accountability_indicator_results_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "accountability_instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "accountability_media" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "instrument_id" TEXT NOT NULL, "lesson_id" TEXT,
  "document_id" TEXT NOT NULL, "kind" TEXT NOT NULL, "recorded_on" TIMESTAMP(3) NOT NULL,
  "location" TEXT NOT NULL, "scope" TEXT NOT NULL, "description" TEXT NOT NULL,
  "public_release" BOOLEAN NOT NULL DEFAULT false, "recorded_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "accountability_media_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "accountability_media_tenant_id_instrument_id_recorded_on_idx" ON "accountability_media"("tenant_id", "instrument_id", "recorded_on");
ALTER TABLE "accountability_media" ADD CONSTRAINT "accountability_media_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "accountability_instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
