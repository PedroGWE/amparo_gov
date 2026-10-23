-- CreateTable
CREATE TABLE "_CursoBeneficiarios" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CursoBeneficiarios_AB_unique" ON "_CursoBeneficiarios"("A", "B");

-- CreateIndex
CREATE INDEX "_CursoBeneficiarios_B_index" ON "_CursoBeneficiarios"("B");

-- AddForeignKey
ALTER TABLE "_CursoBeneficiarios" ADD CONSTRAINT "_CursoBeneficiarios_A_fkey" FOREIGN KEY ("A") REFERENCES "beneficiaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CursoBeneficiarios" ADD CONSTRAINT "_CursoBeneficiarios_B_fkey" FOREIGN KEY ("B") REFERENCES "cursos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve each established activity independently; financing projects may serve
-- several modalities and must never be used to infer a student's modality.
INSERT INTO "_CursoBeneficiarios" ("A", "B")
SELECT b.id, c.id
FROM beneficiaries b
JOIN cursos c ON c.tenant_id = b.tenant_id AND c.legacy_project_id = b.project_id
WHERE b.deleted_at IS NULL
UNION
SELECT b.id, c.id
FROM beneficiaries b
JOIN beneficiarios_projetos v ON v.beneficiary_id = b.id AND v.status = 'ATIVO'
JOIN cursos c ON c.tenant_id = b.tenant_id AND c.legacy_project_id = v.project_id
WHERE b.deleted_at IS NULL
UNION
SELECT b.id, c.id
FROM beneficiaries b
JOIN matriculas m ON m.aluno_id = b.id AND m.tenant_id = b.tenant_id AND m.status = 'ATIVA'
JOIN turmas t ON t.id = m.turma_id AND t.tenant_id = b.tenant_id AND t.deleted_at IS NULL
JOIN cursos c ON c.id = t.curso_id AND c.tenant_id = b.tenant_id
WHERE b.deleted_at IS NULL
ON CONFLICT DO NOTHING;
