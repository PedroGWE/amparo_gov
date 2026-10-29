# Oportunidades e recursos para projetos sociais

Primeira versão, 29/10/2026. Rota de interface: `/{tenant}/recursos`; detalhes compartilháveis em `/{tenant}/recursos/{id}` (exigem sessão e visibilidade no tenant). Integra a arquitetura existente: NestJS 10/Fastify, Next.js 14, PostgreSQL/Prisma, JWT, permissões, SWR e Tailwind. Os módulos anteriores de Editais (incluindo PNCP), parcerias e importação de instrumentos Transferegov permanecem disponíveis. Este catálogo trata recursos sociais e não considera uma licitação, instrumento celebrado ou pagamento como inscrição aberta por associação.

## Executar

1. Configure o banco e JWT conforme o README e `apps/api/.env.example`.
2. Execute `pnpm --filter @cidadao/api exec prisma generate` e `pnpm --filter @cidadao/api exec prisma migrate deploy`.
3. Execute `pnpm dev` ou os builds/start habituais. Em PowerShell com bloqueio de scripts, use `pnpm.cmd`.
4. Acesse **Oportunidades e recursos** no menu. Transferegov e BNDES começam habilitados após a migração. O scheduler roda a cada minuto, com bloqueio por conector no banco. A primeira sincronização pode levar alguns minutos; a interface não contém dados fictícios pré-cadastrados.
5. Configure intervalo (1–720 horas), tamanho de página (1–200) e orçamento (1–100 páginas) na Administração. Por padrão são 100 registros/página e 10 páginas/execução. A execução parcial continua após um minuto do cursor persistido; ao completar a varredura, aguarda o intervalo configurado. Alterar tamanho de página reinicia o cursor para evitar saltos.

Para administrar conectores compartilhados, configure no backend `RESOURCES_ADMIN_USER_IDS` com os IDs dos usuários operadores, separados por vírgula. Esses usuários também precisam da permissão existente `*`. O `*` dos administradores de organização **não é considerado privilégio global por si só**. Sem allowlist, as coletas públicas continuam agendadas e todos os administradores podem gerenciar apenas seus próprios registros manuais e perfis.

`RESOURCES_SCHEDULER_ENABLED=false` desativa o agendador neste processo, mantendo a sincronização administrativa disponível. Todas as instâncias devem compartilhar PostgreSQL. O lease de dez minutos é renovado a cada página; execuções interrompidas são recuperadas pela próxima instância. Não é uma fila independente do processo da API. O progresso de cada página é transacional. Registros nunca são apagados por indisponibilidade ou ausência numa página.

## Validação oficial e cobertura

Resultados reproduzíveis em [resource-source-validation.json](resource-source-validation.json). Na revalidação final, Transferegov/BNDES/Prosas (documentação) retornaram 200 e todos os recursos consultados do Salic retornaram 503. As observações iniciais do Salic (documentação 200, agregado 200 e validação 422) ficam em [resource-source-initial-observations.json](resource-source-initial-observations.json), sem corpos de resposta. Execute `node apps/api/scripts/validate-resource-sources.cjs` para atualizar status, nomes de campos, paginação e hashes das respostas. O script não registra corpos, documentos pessoais ou tokens. As respostas podem mudar; uma falha de rede não constitui prova de encerramento de um programa.

| Fonte | Endpoints efetivamente consultados / utilizados | Autenticação, paginação, condições e limites |
|---|---|---|
| Transferegov Discricionárias e Legais | `/discricionarias/openapi.json`, `/discricionarias/todos-programas`, `/discricionarias/data-atualizacao` em `https://api-publica.transferegov.gestao.gov.br` | GET público, sem chave; `pagina` começa em 1, `tamanho_da_pagina` até 200; retorno `data`, `total_pages`, `total_items`. O portal autoriza integração automatizada dos dados públicos. Nenhuma cota de requisições foi encontrada no OpenAPI consultado; não se presume consumo ilimitado. |
| Transferegov Gestão de Parcerias | `/parcerias/openapi.json`, `/parcerias/programa`, `/parcerias/data-atualizacao` no mesmo host | Mesma paginação. Campos `programa_atende_a`, `ufs_habilitadas`, `qualificacao_beneficiario`, situação e períodos espontâneo/específico/emenda. O OpenAPI também documenta `/proposta` e `/parceria`; a integração anterior já consulta esses recursos por CNPJ/ID. Não são convertidos em chamadas abertas neste catálogo. |
| BNDES | `https://dadosabertos.bndes.gov.br/api/3/action/package_search?q=operacoes`, `package_show?id=operacoes-financiamento`, `datastore_search?resource_id=6f56b78c-510f-44b6-8274-78a5b7e931f4` | Catálogo e leitura DataStore públicos; `limit`/`offset`, ordenação `numero_do_contrato asc`, retorno `success`, `result.records`, `result.total`. Recurso confirmado como DataStore ativo no catálogo. Licença declarada ODbL: preservar atribuição BNDES e avaliar obrigações de compartilhamento ao redistribuir a base derivada. Teto de consumo do servidor não informado; limite local conservador. |
| Salic | `https://api.salic.cultura.gov.br/docs`, `/api/v1/projetos?limit=2&offset=0`, `/api/v1/projetos?ano_captacao=2026&limit=2&offset=0`, `/api/v1/incentivadores?limit=2&offset=0` | Documentação pública acessível por HTTPS direto. Consulta padrão de projetos retornou HTTP 500; incentivadores 500/503. `ano_captacao=26` retornou 422 exigindo ano ≥1992, embora exemplo documentado use dois dígitos. Com 2026, retornou agregado com lista de PRONACs e sem projetos paginados. **Desabilitado**. O adaptador preparado só aceita projetos individuais no contrato documentado `_embedded.projetos`; agregados são rejeitados. |
| Prosas | Documentação oficial de REST, token e processos; runtime preparado para `POST https://api.prosas.com.br/auth/oauth2/token` e `GET /selecao/api/v2/third_party/processos` | Requer administrador e OAuth2 `client_credentials`, escopo `confidential:processos.read`. **Nenhuma chamada autenticada foi feita sem credenciais**. Não há evidência de acesso integral à Central de Editais. Paginação, campos e editais da conta deverão ser validados com autorização antes da ingestão. |
| Fundação BB, Petrobras Socioambiental e Incentivo ao Esporte | Links oficiais cadastrados manualmente | Não há conector automático nem API presumida. Importação do formato de intercâmbio GTM abaixo; não é apresentada como formato oficial de exportação dessas instituições. Novos formatos de origem exigem documentação e validação próprias. |

Referências: [portal Transferegov](https://api-publica.transferegov.gestao.gov.br/), [Discricionárias](https://api-publica.transferegov.gestao.gov.br/discricionarias/docs), [Parcerias](https://api-publica.transferegov.gestao.gov.br/parcerias/docs), [BNDES — exemplos oficiais](https://github.com/bndes/dados-abertos-exemplos), [CKAN DataStore](https://docs.ckan.org/en/latest/maintaining/datastore.html#the-datastore-api), [Salic](https://api.salic.cultura.gov.br/docs), [Prosas](https://developer.prosas.com.br/docs/restapi/prosas-api-rest/), [processos disponíveis ao cliente](https://developer.prosas.com.br/docs/restapi/listar-processos-disponiveis/).

Não foram usados endpoints privados, sessões de navegador, cookies de autenticação, coleta automatizada de páginas de editais ou mecanismos de contorno. Os GETs de HTML se limitaram à documentação pública e ao catálogo indicado pelo solicitante.

### Limites desta versão

- Transferegov consulta programas do **ano corrente**, configurável no servidor com `RESOURCES_PROGRAM_YEAR`. Programas de outros anos com prazos ainda vigentes podem não aparecer. Ao mudar o ano, reinicie os cursores (alterando tamanho de página) e sincronize. A cobertura aumenta conforme as execuções parciais avançam; o painel exibe esse progresso. Não há garantia de catálogo exaustivo.
- Discricionárias repete programa por UF/natureza/modalidade/subtipo/qualificação. Essas variantes conservam requisitos próprios: a chave é `id_programa:hash_da_variante`. O ID oficial integral continua em `raw_data.id_programa` e no link de consulta. Linhas idênticas colapsam pela chave única; variantes distintas não são unidas a ponto de ampliar indevidamente elegibilidade.
- Em Parcerias, público-alvo social e qualificação do beneficiário não bastam para inferir natureza jurídica. Somente valores expressos em `programa_atende_a` reconhecidos pelo adaptador geram perfis elegíveis. Campos não reconhecidos permanecem no texto/evidência e geram informação insuficiente.
- As APIs de programas não forneceram link de inscrição por registro nas respostas verificadas. O botão leva à consulta oficial da API e o campo de inscrição fica “Não informado”. Observações oficiais que indicam outro canal são preservadas para consulta.
- BNDES cobre **operações não automáticas** (apoio direto/indireto não automático), não todo o portfólio e não editais. Valor contratado e desembolsado são distintos. O financiador BNDES aparece com evidência da operação; isso não significa disposição atual para novo patrocínio.
- Salic não está operacional para ingestão: a indisponibilidade/incompatibilidade observada não é substituída por exemplos da documentação. O código conserva valores aprovados/captados e proponente quando houver projeto individual válido. Sem evidência de autorização e período de captação, nenhum registro Salic se torna `AUTORIZACAO_CAPTACAO`. Incentivadores e suas doações aguardam validação real; não há relacionamento presumido.
- Prosas exige `PROSAS_CLIENT_ID`, `PROSAS_CLIENT_SECRET`, `PROSAS_SCOPES` e `PROSAS_ACCESS_CONFIRMED=true` no servidor. O código confirma o escopo retornado pelo token, testa a listagem autorizada e **interrompe a ingestão** com `PROSAS_ACESSO_TESTADO_MAPEAMENTO_DOS_PROCESSOS_PENDENTE` até mapear os processos/paginação com a conta autorizada. Esta é uma estrutura de conector, não uma integração validada sem credenciais.
- A comparação automática cobre perfil, natureza jurídica, UF/município, áreas de atuação, idade em anos completos e abrangência. Requisitos textuais como certidões exigem análise humana e mantêm “Informações insuficientes”. Outros perfis só podem ser usados quando a fonte os prevê expressamente.

## Classificação e datas

`OPORTUNIDADE` só entra em **Disponíveis** quando existe evidência oficial de disponibilidade, início e fim válidos, período atual e ausência de restrição específica. `DISPONIBILIZADO` sozinho nunca basta. Períodos de emenda e de beneficiários específicos são preservados em `dates`, sem substituir o período de inscrição espontânea/voluntária.

`AUTORIZACAO_CAPTACAO` fica na aba fiscal; não é edital. `PROJETO_FINANCIADO` e `HISTORICO_FINANCIADOR` ficam em histórico. `TRANSFERENCIA_PUBLICA` tem aba própria, mesmo quando há período informado. `PROGRAMA` representa inteligência sem disponibilidade comprovada. O catálogo completo permite encontrar todos esses registros e situações encerradas ou insuficientes.

Datas originais ficam em texto, com significado e precisão. `YYYY-MM-DD` é uma data de calendário, sem hora artificial. Transferegov publica datas sem fuso: a comparação usa explicitamente o calendário de `America/Sao_Paulo` como **referência do sistema**, sem atribuir esse fuso a um horário oficial inexistente. Instantes exigem ISO com offset e são comparados pelo instante. Datas de execução, contratação, publicação e captação não são intercambiáveis. A interface mostra datas de origem sem offset literalmente e informa a ausência de fuso. Atualização da base não é apresentada como atualização individual do projeto.

A situação calculada é recalculada nas leituras. A busca por inscrições abertas usa o relógio do PostgreSQL e a mesma regra de calendário/instante; uma oportunidade vence sem depender de nova coleta. Registros sem coleta bem-sucedida há mais de `max(48 horas, 2 × intervalo)` recebem aviso de desatualização. Histórico de execução parcial não significa varredura completa da fonte.

## Dados, segurança e auditoria

Tabelas adicionadas: `resource_sources`, `resource_connectors`, `resource_organizations`, `resource_records`, `resource_requirements`, `resource_funded_projects`, `resource_funders`, `resource_funding_evidence`, `resource_favorites`, `resource_sync_runs`. A migração é aditiva, com fontes reais e configurações; não contém oportunidades fictícias.

Catálogo público compartilhado: `scope=PUBLIC`, `tenant_id=NULL`. Registros manuais: `scope=tenant_id`. Uma restrição SQL garante essa coerência. As consultas privadas sempre usam `tenantId` do JWT, nunca do corpo ou query string. Favoritos e anotações são privados por `(tenant_id,user_id,record_id)`; perfis pertencem à organização. Permissão existente `editais:manage` controla perfis e cadastros manuais. Administração de conectores globais exige a permissão `*` **e inclusão do usuário em `RESOURCES_ADMIN_USER_IDS` no servidor**, impedindo que um administrador de tenant altere a coleta de outras organizações. Guardas existentes também bloqueiam perfis exclusivos do portal educacional.

Importações validam todo o lote antes de gravar e usam transação. Identidade única `(scope,source_id,external_id,kind)` evita duplicação; upsert preserva ID, favoritos e data inicial de coleta. A chave inclui tipo para impedir confundir identidades de categorias diferentes. Para corrigir o tipo de um registro manual já publicado, remova a versão incorreta e cadastre a nova classificação; somente a fonte/ID/tipo idênticos atualizam o mesmo registro. Campos originais auditáveis são selecionados por allowlist; CNPJ/CPF, endereço, contatos e documentos pessoais não são coletados pelo novo módulo. `raw_data` não é enviado pelas APIs de leitura. Administradores do banco podem auditar a seleção original, ID oficial e data da base/coleta.

URLs de rede dos conectores são fixas/permitidas por host e HTTPS. Não há proxy/fetch de URL fornecida pelo usuário; links manuais são exibidos e não acessados pelo backend. Redirecionamentos de rede são rejeitados. Respostas têm limite de 8 MB, timeout de 25 segundos e quatro tentativas; 429/5xx e erros de rede têm espera progressiva de 1/2/4 segundos, com `Retry-After` limitado a 30 segundos. Inícios de requisição são espaçados em pelo menos 600 ms por processo. Logs de execução conservam códigos de erro sanitizados, contagens, cursores e horários, sem respostas, SQL, tokens ou secrets. As credenciais Prosas existem apenas em variáveis do backend.

## API interna

Prefixo `/api/v1/resources`; todas as rotas exigem JWT. Retornos de data/valor ausentes usam `null`/arrays vazios no contrato e “Não informado” na interface.

| Método e rota | Finalidade / permissão |
|---|---|
| `GET /search` | Busca: `q`, `theme`, `territory` (valor exato), `funder`, `support_type`, `profile`, `source`, `kind`, `view`, `page`, `limit` (até 100). `view`: available (padrão), catalog, history, fundraising, public. Retorna data/total/page/totalPages. |
| `GET /dashboard` | Contagens reais, cinco próximos prazos, fontes, última coleta e dez execuções recentes. |
| `GET /:id` | Detalhes, requisitos, valores, documentos, origem, atualização e compatibilidade explicada. 404 se invisível ao tenant. |
| `GET /organization` | Perfil do módulo; usa campos do perfil institucional existente para preenchimento inicial sem inferir natureza jurídica. |
| `PUT /organization` | `editais:manage`; name, applicant_type, legal_nature, uf, city, founded_on, themes, territorial_scope. Campos não informados ficam null. |
| `GET /favorites` | Favoritos/anotações do usuário autenticado nesta organização. |
| `PUT /favorites/:recordId` | Salvar/atualizar `{stage,notes?}`. Etapas IDENTIFICADA, EM_ANALISE, EM_PREPARACAO, ENVIADA, CONCLUIDA. |
| `DELETE /favorites/:recordId` | Remover somente o favorito do usuário/tenant. |
| `POST /manual` | `editais:manage`; um registro no contrato abaixo, upsert. |
| `POST /manual/import` | `editais:manage`; array JSON de 1–200 registros; transação e idempotência. |
| `DELETE /manual/:id` | `editais:manage`; apenas cadastro manual da organização atual. |
| `GET /admin/connectors` | `*` + allowlist do operador; configuração, limitações, presença de credenciais (booleano) e dez execuções por conector. |
| `PATCH /admin/connectors/:id` | `*` + allowlist do operador; enabled, interval_hours, page_size, max_pages. 409 durante execução. IDs iguais aos IDs de fontes. |
| `POST /admin/connectors/:id/sync` | `*` + allowlist do operador; inicia e retorna execução. 409 se já em andamento; 400 se desabilitado. |

Não há endpoint de envio de propostas, documentos ou inscrição automática.

### Intercâmbio JSON GTM

Arquivo UTF-8 com array; a interface limita arquivo a 1 MB e o backend valida até 200 itens por requisição. Para atualizar um cadastro, mantenha fonte/ID/tipo. Este exemplo é **fictício, exclusivo para documentação/testes**; não deve ser importado como oportunidade real:

```json
[
  {
    "source_id": "MANUAL",
    "external_id": "EXEMPLO-FICTICIO-NAO-IMPORTAR",
    "kind": "OPORTUNIDADE",
    "title": "Demonstração fictícia — sem inscrições reais",
    "source_url": "https://www.gov.br/",
    "availability_evidence": false,
    "eligible_profiles": [],
    "territories": [],
    "amounts": [],
    "documents": [],
    "requirements": []
  }
]
```

Obrigatórios: source_id (`MANUAL`, `FBB`, `PETROBRAS`, `ESPORTE`), external_id, kind, title, source_url HTTPS sem credenciais. Demais campos: description, theme, eligibility_text, eligible_profiles (`EMPRESA`, `OSC`, `ORGAO_PUBLICO`, `PESSOA_FISICA`, `OUTROS`), territories, support_type, funder_name, application_url, official_status, starts_on, ends_on, timezone, restricted, source_updated_at. Não envie scope, tenant_id, user_id, raw_data ou timestamps internos; serão rejeitados.

`amounts`: `{meaning,amount,currency:"BRL"}` com amount string decimal sem separador de milhar. `dates`: `{meaning,value}` (data ou instante com offset). `documents`: `{title,url}` HTTPS. `requirements`: `{field,operator,value,evidence}`; field applicant_type/uf/city/legal_nature/themes/territorial_scope usa IN + array de valores; age_years usa MIN + número; other usa TEXT + texto. Evidência textual é obrigatória. Perfis elegíveis informados manualmente também geram requisito estruturado. Texto de elegibilidade não interpretável vira requisito textual pendente. `availability_evidence=true` exige situação e período expresso. Não publique requisitos ou datas estimados.

## Verificação

```sh
pnpm --filter @cidadao/api test -- --runInBand resources
pnpm --filter @cidadao/api lint
pnpm --filter @cidadao/api build
pnpm --filter @cidadao/web build
node apps/api/scripts/validate-resource-sources.cjs
```

Os testes unitários cobrem classificação, dados ausentes, offset/dia de calendário, comparação com requisitos, minimização, escopo de favoritos, permissões globais, falha sem exclusão de dados, retries 429 e rejeição de agregados Salic. Testes de integração usam Fastify real, JWT e guardas reais e PostgreSQL.

Os testes de renderização verificam os componentes reais, ausência de campos, fonte, separação de histórico, datas sem horário inventado, precisão monetária, avisos de falha/desatualização, explicação da compatibilidade e chaves de cache por usuário/tenant. A inspeção visual em navegador ficou pendente: o ambiente de controle não disponibilizou navegador e a conexão nativa retornou indisponível em duas tentativas. Layout responsivo implementado com os padrões Tailwind do projeto, ainda sujeito a revisão visual em desktop/celular.

Para integração, prepare um **banco novo e isolado com `test` no nome** e aplique todas as migrações. Defina `RESOURCE_TEST_DATABASE_URL` e execute `pnpm --filter @cidadao/api test -- --runInBand resources.integration`. O teste cria dois tenants e três usuários fictícios e limpa somente esses cadastros. `RESOURCE_LIVE_TEST=true` habilita também consulta pública real a Transferegov/BNDES e gravação repetida de páginas no banco de teste. O teste confirma contagens invariantes ao repetir a ingestão, separação de histórico, filtros, 401/403/404, isolamento entre tenants/usuários e restrição SQL de propriedade. Sem essas variáveis, testes de integração ficam explicitamente ignorados. Nunca use produção.

### Resultado desta entrega

- PostgreSQL 16 temporário e isolado: todas as migrações aplicadas desde o baseline, incluindo `20261029120000_social_resources`; bancos existentes preservados.
- API: **188 testes passaram em 24 suítes**, incluindo 11 testes de integração com JWT/Fastify/PostgreSQL e consulta real às fontes públicas.
- Cada um dos três conectores públicos executou duas sincronizações do mesmo recorte real: duas linhas e **dois registros únicos**, com contagem inalterada após repetição; cursores e histórico gravados pelo worker.
- Frontend: **33 testes passaram**, incluindo seis testes dos novos componentes. Builds da API e do frontend concluídos.
- Salic e Prosas desabilitados pelas dependências/limitações registradas. Sem deploy ou migração nos bancos de produção nesta entrega; aplicar a migração e configurar operadores no processo de ativação.
