ALTER TABLE "documents" ADD COLUMN "beneficiary_id" TEXT;

CREATE INDEX "documents_tenant_id_beneficiary_id_idx" ON "documents"("tenant_id", "beneficiary_id");

ALTER TABLE "documents" ADD CONSTRAINT "documents_beneficiary_id_fkey"
  FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
