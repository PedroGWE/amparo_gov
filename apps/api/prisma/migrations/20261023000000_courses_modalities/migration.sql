-- AlterTable
ALTER TABLE "editais" ADD COLUMN     "project_id" TEXT;

-- AlterTable
ALTER TABLE "turmas" ADD COLUMN     "curso_id" TEXT;

-- CreateTable
CREATE TABLE "cursos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'MODALIDADE',
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "inscricoes_abertas" BOOLEAN NOT NULL DEFAULT true,
    "legacy_project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cursos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CursoProjects" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_CursoEmendas" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_CursoEditais" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "cursos_legacy_project_id_key" ON "cursos"("legacy_project_id");

-- CreateIndex
CREATE INDEX "cursos_tenant_id_ativo_idx" ON "cursos"("tenant_id", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "cursos_tenant_id_nome_key" ON "cursos"("tenant_id", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "_CursoProjects_AB_unique" ON "_CursoProjects"("A", "B");

-- CreateIndex
CREATE INDEX "_CursoProjects_B_index" ON "_CursoProjects"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_CursoEmendas_AB_unique" ON "_CursoEmendas"("A", "B");

-- CreateIndex
CREATE INDEX "_CursoEmendas_B_index" ON "_CursoEmendas"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_CursoEditais_AB_unique" ON "_CursoEditais"("A", "B");

-- CreateIndex
CREATE INDEX "_CursoEditais_B_index" ON "_CursoEditais"("B");

-- CreateIndex
CREATE INDEX "editais_project_id_idx" ON "editais"("project_id");

-- CreateIndex
CREATE INDEX "turmas_curso_id_idx" ON "turmas"("curso_id");

-- AddForeignKey
ALTER TABLE "editais" ADD CONSTRAINT "editais_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cursos" ADD CONSTRAINT "cursos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cursos" ADD CONSTRAINT "cursos_legacy_project_id_fkey" FOREIGN KEY ("legacy_project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_curso_id_fkey" FOREIGN KEY ("curso_id") REFERENCES "cursos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CursoProjects" ADD CONSTRAINT "_CursoProjects_A_fkey" FOREIGN KEY ("A") REFERENCES "cursos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CursoProjects" ADD CONSTRAINT "_CursoProjects_B_fkey" FOREIGN KEY ("B") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CursoEmendas" ADD CONSTRAINT "_CursoEmendas_A_fkey" FOREIGN KEY ("A") REFERENCES "cursos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CursoEmendas" ADD CONSTRAINT "_CursoEmendas_B_fkey" FOREIGN KEY ("B") REFERENCES "emendas_parlamentares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CursoEditais" ADD CONSTRAINT "_CursoEditais_A_fkey" FOREIGN KEY ("A") REFERENCES "cursos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CursoEditais" ADD CONSTRAINT "_CursoEditais_B_fkey" FOREIGN KEY ("B") REFERENCES "editais"("id") ON DELETE CASCADE ON UPDATE CASCADE;
