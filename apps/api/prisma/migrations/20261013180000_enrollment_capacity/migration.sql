ALTER TYPE "ConectaMatriculaStatus" ADD VALUE 'EM_ESPERA';

ALTER TABLE "turmas" ADD COLUMN "capacidade" INTEGER;

ALTER TABLE "matriculas"
  ADD COLUMN "solicitante_tipo" TEXT,
  ADD COLUMN "solicitante_nome" TEXT,
  ADD COLUMN "solicitante_contato" TEXT;

CREATE INDEX "matriculas_turma_id_status_created_at_idx" ON "matriculas"("turma_id", "status", "created_at");
