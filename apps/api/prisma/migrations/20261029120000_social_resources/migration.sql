-- Additive catalog; no changes to existing funding, editais or Transferegov data.
CREATE TABLE "resource_sources" (
 "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "official_url" TEXT NOT NULL,
 "documentation_url" TEXT NOT NULL, "mode" TEXT NOT NULL, "validation" JSONB NOT NULL DEFAULT '{}'
);
CREATE TABLE "resource_connectors" (
 "id" TEXT PRIMARY KEY, "source_id" TEXT NOT NULL UNIQUE REFERENCES "resource_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "enabled" BOOLEAN NOT NULL DEFAULT false, "interval_hours" INTEGER NOT NULL DEFAULT 24,
 "page_size" INTEGER NOT NULL DEFAULT 100, "max_pages" INTEGER NOT NULL DEFAULT 10,
 "cursor" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'READY',
 "next_sync_at" TIMESTAMPTZ(3), "last_success_at" TIMESTAMPTZ(3), "last_attempt_at" TIMESTAMPTZ(3),
 "lease_until" TIMESTAMPTZ(3), "last_error" TEXT,
 CONSTRAINT resource_connector_limits CHECK (interval_hours BETWEEN 1 AND 720 AND page_size BETWEEN 1 AND 200 AND max_pages BETWEEN 1 AND 100 AND cursor >= 0)
);
CREATE TABLE "resource_organizations" (
 "id" TEXT PRIMARY KEY, "tenant_id" TEXT NOT NULL UNIQUE REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "name" TEXT NOT NULL, "applicant_type" TEXT, "legal_nature" TEXT, "uf" TEXT, "city" TEXT,
 "founded_on" TEXT, "themes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "territorial_scope" TEXT, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "resource_records" (
 "id" TEXT PRIMARY KEY, "scope" TEXT NOT NULL DEFAULT 'PUBLIC',
 "tenant_id" TEXT REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "source_id" TEXT NOT NULL REFERENCES "resource_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "external_id" TEXT NOT NULL, "source_url" TEXT NOT NULL, "application_url" TEXT,
 "kind" TEXT NOT NULL, "origin" TEXT NOT NULL, "title" TEXT, "description" TEXT, "theme" TEXT,
 "territories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "eligible_profiles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "eligibility_text" TEXT, "support_type" TEXT, "funder_name" TEXT,
 "amounts" JSONB NOT NULL DEFAULT '[]', "dates" JSONB NOT NULL DEFAULT '[]', "documents" JSONB NOT NULL DEFAULT '[]',
 "starts_on" TEXT, "ends_on" TEXT, "timezone" TEXT, "official_status" TEXT,
 "availability_evidence" BOOLEAN NOT NULL DEFAULT false, "restricted" BOOLEAN NOT NULL DEFAULT false,
 "calculated_status" TEXT NOT NULL DEFAULT 'INFORMACOES_INSUFICIENTES', "source_updated_at" TEXT,
 "collected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "last_success_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "raw_data" JSONB NOT NULL DEFAULT '{}',
 CONSTRAINT "resource_records_scope_source_id_external_id_kind_key" UNIQUE ("scope","source_id","external_id","kind"),
 CONSTRAINT resource_record_scope CHECK ((scope = 'PUBLIC' AND tenant_id IS NULL) OR (scope = tenant_id AND tenant_id IS NOT NULL)),
 CONSTRAINT resource_record_kind CHECK (kind IN ('OPORTUNIDADE','AUTORIZACAO_CAPTACAO','PROJETO_FINANCIADO','HISTORICO_FINANCIADOR','TRANSFERENCIA_PUBLICA','PROGRAMA'))
);
CREATE INDEX "resource_records_tenant_id_kind_idx" ON "resource_records"("tenant_id","kind");
CREATE INDEX "resource_records_kind_availability_evidence_ends_on_idx" ON "resource_records"("kind","availability_evidence","ends_on");
CREATE INDEX "resource_records_source_id_last_success_at_idx" ON "resource_records"("source_id","last_success_at");
CREATE TABLE "resource_requirements" (
 "id" TEXT PRIMARY KEY, "record_id" TEXT NOT NULL REFERENCES "resource_records"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "field" TEXT NOT NULL, "operator" TEXT NOT NULL, "value" JSONB NOT NULL, "evidence" TEXT NOT NULL
);
CREATE INDEX "resource_requirements_record_id_idx" ON "resource_requirements"("record_id");
CREATE TABLE "resource_funded_projects" (
 "id" TEXT PRIMARY KEY, "record_id" TEXT NOT NULL UNIQUE REFERENCES "resource_records"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "proponent_name" TEXT, "approved_amount" TEXT, "raised_amount" TEXT, "contracted_amount" TEXT, "disbursed_amount" TEXT
);
CREATE TABLE "resource_funders" (
 "id" TEXT PRIMARY KEY, "source_id" TEXT NOT NULL, "external_id" TEXT NOT NULL,
 "name" TEXT NOT NULL, "source_url" TEXT NOT NULL,
 CONSTRAINT "resource_funders_source_id_external_id_key" UNIQUE ("source_id","external_id")
);
CREATE TABLE "resource_funding_evidence" (
 "record_id" TEXT NOT NULL REFERENCES "resource_records"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "funder_id" TEXT NOT NULL REFERENCES "resource_funders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "meaning" TEXT NOT NULL, "amount" TEXT, PRIMARY KEY ("record_id","funder_id")
);
CREATE TABLE "resource_favorites" (
 "id" TEXT PRIMARY KEY,
 "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "record_id" TEXT NOT NULL REFERENCES "resource_records"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "stage" TEXT NOT NULL DEFAULT 'IDENTIFICADA', "notes" TEXT, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "resource_favorites_tenant_id_user_id_record_id_key" UNIQUE ("tenant_id","user_id","record_id"),
 CONSTRAINT resource_favorite_stage CHECK (stage IN ('IDENTIFICADA','EM_ANALISE','EM_PREPARACAO','ENVIADA','CONCLUIDA'))
);
CREATE TABLE "resource_sync_runs" (
 "id" TEXT PRIMARY KEY, "connector_id" TEXT NOT NULL REFERENCES "resource_connectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "status" TEXT NOT NULL DEFAULT 'RUNNING', "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "finished_at" TIMESTAMPTZ(3), "processed" INTEGER NOT NULL DEFAULT 0, "pages" INTEGER NOT NULL DEFAULT 0,
 "cursor_start" INTEGER NOT NULL DEFAULT 0, "cursor_end" INTEGER NOT NULL DEFAULT 0, "error" TEXT
);
CREATE INDEX "resource_sync_runs_connector_id_started_at_idx" ON "resource_sync_runs"("connector_id","started_at");

-- Source registry contains only verified metadata. No fictional opportunities are seeded.
INSERT INTO resource_sources (id,name,official_url,documentation_url,mode,validation) VALUES
('TG_DISCRICIONARIAS','Transferegov — Discricionárias e Legais','https://api-publica.transferegov.gestao.gov.br/','https://api-publica.transferegov.gestao.gov.br/discricionarias/docs','PUBLIC_API','{"validated_on":"2026-10-29","auth":"public","page_max":200,"limitation":"Programas podem repetir por UF e natureza jurídica. Apenas o período voluntário com situação Disponibilizado comprova recebimento aberto. Limite de requisições não publicado na documentação consultada."}'),
('TG_PARCERIAS','Transferegov — Gestão de Parcerias','https://api-publica.transferegov.gestao.gov.br/','https://api-publica.transferegov.gestao.gov.br/parcerias/docs','PUBLIC_API','{"validated_on":"2026-10-29","auth":"public","page_max":200,"limitation":"Períodos espontâneo, específico e de emenda são distintos. Qualificação do beneficiário não comprova natureza jurídica. Limite de requisições não publicado."}'),
('BNDES','BNDES — Operações não automáticas','https://dadosabertos.bndes.gov.br/pt_BR/','https://github.com/bndes/dados-abertos-exemplos','PUBLIC_API','{"validated_on":"2026-10-29","auth":"public","license":"ODbL","resource_id":"6f56b78c-510f-44b6-8274-78a5b7e931f4","limitation":"Histórico de operações contratadas. Não disponibiliza inscrição nem comprova editais abertos. Atribuição BNDES; catálogo derivado sujeito às condições ODbL."}'),
('SALIC','Salic — Lei Rouanet','https://api.salic.cultura.gov.br/','https://api.salic.cultura.gov.br/docs','UNAVAILABLE','{"validated_on":"2026-10-29","auth":"public","limitation":"Documentação acessível. Projetos sem ano_captacao retornaram 500; com 2026 retornaram agregado sem paginação de projetos; incentivadores retornaram 500/503. Desabilitado até validar o contrato real. Datas de execução não comprovam autorização de captação."}'),
('PROSAS','Prosas','https://prosas.com.br/','https://developer.prosas.com.br/docs/restapi/prosas-api-rest/','AUTHORIZED_ONLY','{"validated_on":"2026-10-29","auth":"OAuth2 client_credentials","scope":"confidential:processos.read","limitation":"Depende de administrador, credenciais e confirmação de permissões. Acesso apenas aos processos disponíveis ao cliente autenticado; não presume acesso à Central de Editais. Mapeamento e paginação dependem da validação com conta autorizada."}'),
('FBB','Fundação Banco do Brasil','https://fbb.org.br/','https://fbb.org.br/','MANUAL','{"limitation":"Cadastro manual com link oficial. Nenhuma API ou formato de exportação da fonte foi presumido."}'),
('PETROBRAS','Petrobras Socioambiental','https://petrobras.com.br/','https://petrobras.com.br/','MANUAL','{"limitation":"Cadastro manual com link oficial. Nenhuma API ou formato de exportação da fonte foi presumido."}'),
('ESPORTE','Lei de Incentivo ao Esporte','https://www.gov.br/esporte/','https://www.gov.br/esporte/','MANUAL','{"limitation":"Cadastro manual com evidência oficial. Autorização de captação não é edital aberto."}'),
('MANUAL','Cadastro manual com fonte oficial','https://www.gov.br/','https://www.gov.br/','MANUAL','{"limitation":"Registros restritos à organização que os cadastrou; formato JSON GTM documentado para importação."}');
INSERT INTO resource_connectors (id,source_id,enabled,next_sync_at) VALUES
('TG_DISCRICIONARIAS','TG_DISCRICIONARIAS',true,CURRENT_TIMESTAMP),
('TG_PARCERIAS','TG_PARCERIAS',true,CURRENT_TIMESTAMP),
('BNDES','BNDES',true,CURRENT_TIMESTAMP),
('SALIC','SALIC',false,NULL),
('PROSAS','PROSAS',false,NULL);
