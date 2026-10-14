-- AlterTable
ALTER TABLE "users" ADD COLUMN     "student_code" TEXT;

-- AlterTable
ALTER TABLE "beneficiaries" ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "professores" ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "entregas_atividades" ADD COLUMN     "anexos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "feedback" TEXT;

-- CreateTable
CREATE TABLE "educa_aulas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "turma_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "meet_url" TEXT NOT NULL,
    "chamada_enviada_at" TIMESTAMP(3),
    "enviada_por" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "educa_aulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educa_presencas" (
    "id" TEXT NOT NULL,
    "aula_id" TEXT NOT NULL,
    "matricula_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "educa_presencas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educa_materiais" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "turma_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT,
    "anexo_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "educa_materiais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educa_arquivos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "turma_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "educa_arquivos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "educa_aulas_tenant_id_turma_id_inicio_idx" ON "educa_aulas"("tenant_id", "turma_id", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "educa_presencas_aula_id_matricula_id_key" ON "educa_presencas"("aula_id", "matricula_id");

-- CreateIndex
CREATE INDEX "educa_materiais_tenant_id_turma_id_idx" ON "educa_materiais"("tenant_id", "turma_id");

-- CreateIndex
CREATE INDEX "educa_arquivos_tenant_id_turma_id_idx" ON "educa_arquivos"("tenant_id", "turma_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_student_code_key" ON "users"("tenant_id", "student_code");

-- CreateIndex
CREATE UNIQUE INDEX "beneficiaries_user_id_key" ON "beneficiaries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "professores_user_id_key" ON "professores"("user_id");

-- AddForeignKey
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professores" ADD CONSTRAINT "professores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educa_aulas" ADD CONSTRAINT "educa_aulas_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educa_presencas" ADD CONSTRAINT "educa_presencas_aula_id_fkey" FOREIGN KEY ("aula_id") REFERENCES "educa_aulas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educa_presencas" ADD CONSTRAINT "educa_presencas_matricula_id_fkey" FOREIGN KEY ("matricula_id") REFERENCES "matriculas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educa_materiais" ADD CONSTRAINT "educa_materiais_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

