CREATE TABLE "beneficiary_profile_invites" (
    "id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "beneficiary_profile_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "beneficiary_profile_invites_token_hash_key" ON "beneficiary_profile_invites"("token_hash");
CREATE INDEX "beneficiary_profile_invites_beneficiary_id_used_at_idx" ON "beneficiary_profile_invites"("beneficiary_id", "used_at");
CREATE INDEX "beneficiary_profile_invites_tenant_id_idx" ON "beneficiary_profile_invites"("tenant_id");
ALTER TABLE "beneficiary_profile_invites" ADD CONSTRAINT "beneficiary_profile_invites_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
