ALTER TABLE "beneficiaries" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "beneficiaries_tenant_id_deleted_at_idx" ON "beneficiaries"("tenant_id", "deleted_at");
