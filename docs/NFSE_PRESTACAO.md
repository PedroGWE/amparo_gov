# Prestação de contas e NFS-e de serviços

> Atualização: a consolidação fiscal legada considera transações em situação `PAGO` no período. Despesas somente aprovadas não são apresentadas como desembolsos. A preparação mensal por instrumento está descrita em `docs/PRESTACAO_MENSAL.md` e não altera a emissão fiscal existente.

## O que foi integrado

A prestação consolida receitas e despesas aprovadas/pagas no período, pode ser filtrada por projeto e preserva documentos e glosas de itens durante o recálculo. As notas de fornecedores já vinculadas às despesas aparecem na tabela. O CSV inclui número, chave e situação da NFS-e associada a cada receita, além das notas de fornecedores. Uma prestação com notas fiscais abertas ou sem XML arquivado não pode passar de revisão interna para `SUBMETIDO`.

Uma NFS-e é vinculada a uma **receita** consolidada de serviço prestado pela própria organização. O valor é copiado da transação. Uma receita tem uma NFS-e neste MVP. Notas **recebidas de fornecedores** permanecem no modelo `Invoice` do módulo financeiro. Doações não devem ser tratadas automaticamente como serviços faturáveis.

O fluxo `RASCUNHO → ENVIANDO → PROCESSANDO → AUTORIZADA` consulta a API da Focus NFe para a **NFS-e Nacional**. Rejeições retornam mensagem para correção. Se houver timeout ou erro de rede, a nota vai para `CONSULTA_PENDENTE` e é consultada pela mesma referência antes de qualquer reenvio. XML e DANFSe em PDF são copiados para o volume privado `STORAGE_DIR` quando disponibilizados. A autorização pode aparecer antes do arquivo: consulte a nota novamente para tentar arquivar. Notas autorizadas podem seguir `AUTORIZADA → CANCELANDO → CANCELADA`, sempre com justificativa e auditoria; cancelamento é definitivo.

## Configuração por instituto

1. Cadastre o CNPJ emissor no cadastro do instituto. Ele deve coincidir com o certificado e a empresa habilitada no provedor.
2. Habilite a empresa e a NFS-e Nacional no provedor Focus NFe, inclusive o ambiente de homologação. Verifique se o município pode emitir pelo ambiente nacional e se o regime fiscal do prestador está correto.
3. O servidor criptografa os tokens com uma chave dedicada `NFSE_CREDENTIALS_KEY` quando ela estiver definida; caso contrário, deriva uma chave isolada do `JWT_SECRET` já obrigatório. A origem usada fica registrada no próprio valor cifrado, permitindo adotar uma chave dedicada depois sem invalidar credenciais anteriores. Ambas devem ter ao menos 32 caracteres e permanecer estáveis no gerenciador de segredos do deploy.
4. Acesse **Dados públicos e integrações → NFS-e Nacional** no sistema e informe CNPJ, município IBGE, ambiente, token Focus e, opcionalmente, um segredo de webhook. O token e o segredo nunca são devolvidos pela API. `NFSE_FOCUS_TENANTS_JSON` continua aceito apenas para compatibilidade com instalações anteriores.

   Exemplo legado:

   ```json
   {"tenant_id_aqui":{"token":"token_de_homologacao","cnpj":"11222333000181","municipio_ibge":"5300108","environment":"HOMOLOGACAO","webhook_secret":"gere-um-segredo-aleatorio-com-32-ou-mais-caracteres"}}
   ```

5. Mantenha `NFSE_PRODUCTION_ENABLED=false` até concluir testes com dados de homologação. Para produção, selecione `PRODUCAO` na tela e ative `NFSE_PRODUCTION_ENABLED=true` no servidor. O botão de envio também exibe confirmação explícita.
6. Execute as migrações Prisma e mantenha `STORAGE_DIR` em volume persistente; o Docker Compose já encaminha as variáveis do ambiente para o container da API.
7. Para atualização automática, cadastre na Focus um webhook do evento `nfsen` apontando para `https://SEU_DOMINIO/api/v1/fiscal-webhooks/focus/ID_DO_TENANT`. Configure o cabeçalho de autorização como `x-amparo-webhook-secret` e use exatamente o segredo cadastrado na tela. A rota valida o segredo, a referência e o CNPJ antes de alterar uma nota. Sem webhook, o botão **Consultar** continua funcional.

## Uso na aba

1. Crie prestação parcial, final ou anual com período e projeto, e confira os lançamentos consolidados.
2. Em uma receita aprovada ou paga de serviço, clique **Preparar NFS-e**. Informe dados do tomador, município da prestação, código nacional de serviço, competência e enquadramento tributário. O contador deve validar esses dados, inclusive códigos e retenções municipais.
3. Salve e revise o rascunho. Usuário com permissão `accountability:review` pode enviar; usuários com `accountability:read` podem consultar o status e baixar o XML/PDF arquivado.
4. Recalcule antes de avançar para revisão se o financeiro mudar. **Registrar envio externo** apenas grava o estado no Amparo; o envio da prestação ao órgão ou ao Transferegov continua sendo uma ação separada.

## Rotas

Todas sob `/api/v1/accountability` e protegidas por tenant e permissões:

- `GET fiscal/config`: estado do emissor, sem token.
- `GET /:id`, `POST /:id/consolidate`, `PATCH /:id/status`, `GET /:id/export.csv`.
- `GET /:id/fiscal-notes`, `POST /:id/fiscal-notes`, `PATCH /:id/fiscal-notes/:noteId`.
- `POST /:id/fiscal-notes/:noteId/issue`, `POST /:id/fiscal-notes/:noteId/sync`, `POST /:id/fiscal-notes/:noteId/cancel`.
- `GET /:id/fiscal-notes/:noteId/document/xml|pdf` (arquivo privado autenticado).

O webhook público autenticado fica em `POST /api/v1/fiscal-webhooks/focus/:tenantId`. Ele não utiliza sessão do usuário; aceita somente o segredo longo configurado para aquele instituto e responde de forma idempotente a referências desconhecidas.

## Limites de ativação

A integração usa a **Focus NFe** como provedor configurável, com conta e custo próprios. A API nacional direta e emissores municipais específicos não foram integrados. Em produção, é necessário validar em homologação o CNPJ, o município, o regime tributário, o layout exigido para IBS/CBS e os campos requeridos para os serviços reais do instituto. Sem credenciais e testes reais, o sistema não emite notas válidas. Não coloque tokens no banco, no `.env` versionado ou no frontend.

Referências: [documentação oficial NFS-e](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual), [ambientes e APIs oficiais](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao), [emissão Focus NFS-e Nacional](https://doc.focusnfe.com.br/reference/emitir_dps_nacional), [cancelamento Focus](https://doc.focusnfe.com.br/reference/cancelar_nfse_nacional), [webhooks Focus](https://doc.focusnfe.com.br/reference/webhooks) e [guia Focus NFS-e Nacional](https://focusnfe.com.br/guides/nfse/municipios-integrados/municipios-da-nfse-nacional/).
