# Preparação mensal da prestação de contas

## Escopo e fundamento

A competência mensal organiza a preparação interna de evidências por projeto e instrumento. Ela não equivale ao relatório parcial, anual ou final, nem ao protocolo ou à decisão do concedente. A Lei nº 13.019/2014 orienta a comprovação do objeto e das metas; o Decreto nº 8.726/2016 e o Manual MROSC federal só devem orientar regras de parcerias federais abrangidas. A exigência concreta, a periodicidade e o prazo precisam ser confirmados no instrumento, no plano de trabalho, nos aditivos e nas orientações do concedente aplicável.

Fontes oficiais consultadas em 02/11/2026:

- [Lei nº 13.019/2014](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l13019.htm), especialmente arts. 63 a 72.
- [Decreto nº 8.726/2016](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2016/decreto/d8726.htm), para o âmbito federal abrangido.
- [Manual MROSC no Transferegov](https://www.gov.br/transferegov/pt-br/osc/normativos/manual-mrosc).

## Fluxo

1. Escolha um projeto existente e cadastre o instrumento com número, tipo e esfera. O cadastro inicial não altera projetos antigos.
2. Abra a competência `AAAA-MM`. A API devolve a mesma competência se a abertura for repetida. Regras vigentes são copiadas como instâncias de revisão; presenças, horas, pagamentos, assinaturas e evidências nunca são copiadas do mês anterior.
3. Confira as seções de execução do objeto e financeira. Aulas Educa são a unidade de presença; `EducaPresenca` prevalece e `Presenca` por data só é usada se houver uma única aula naquele dia. Ausência de chamada fica pendente. Aulas previstas, canceladas ou remarcadas não entram no denominador.
4. Revise cada requisito. `ANEXO_OBSERVADO`, `INSTRUMENTO_CONFIRMADO`, `CONTROLE_RECOMENDADO` e `NAO_CONFIRMADO` têm significados diferentes. Requisitos só bloqueiam quando marcados como aplicáveis e com bloqueio configurado. Dispensa requer justificativa.
5. Registre vínculos e intervalos reais de ponto. O calendário usa os dias reais do mês, aceita intervalos separados e passagem de meia-noite com duas datas. Escala planejada não gera trabalho realizado.
6. Gere PDFs e XLSX como rascunho. A geração registra versão do template, hash das fontes, versão do arquivo e autor. O anexo de PDF assinado cria uma nova versão, preservando a anterior. `ASSINADO_ANEXADO` não afirma validação criptográfica.
7. Feche após revisar pendências. O backend grava snapshot e hash. Alterações posteriores nas fontes aparecem como divergência, sem modificar o snapshot. Para corrigir, abra revisão com justificativa.
8. Exporte o ZIP com índice e hashes. Registre protocolo externo somente com número, portal e data informados. A exportação não envia ao Transferegov.

## Templates

Seis códigos estão disponíveis: `PRESENCA`, `PONTO`, `SERVICOS`, `OBJETO`, `FINANCEIRO` e `CHECKLIST`. Cada versão tem título, layout, campos, regras e escopo. A versão 1 é criada no tenant ao cadastrar o primeiro instrumento. `POST /accountability/monthly/templates/:code/versions` cria uma versão nova sem alterar documentos históricos. O escopo pode usar `project_id`, `instrument_id`, `modalidade`, `turma_id` e `competence_id`. O seletor usa o escopo mais específico compatível, seguido da versão mais recente. A geração por turma permite duas modalidades e meses consecutivos usando a mesma biblioteca. Os campos configuráveis de apresentação atualmente são `intro` e `footer`; outras regras de layout ainda requerem implementação.

## Modelo de dados e migração

A migração aditiva está em `apps/api/prisma/migrations/20261102180000_monthly_accountability/migration.sql`. Ela preserva `AccountabilityReport`, `AccountabilityItem`, `AccountabilityGloss`, NFS-e e prestações existentes. A estrutura mensal adiciona instrumento, templates, regras versionadas, instâncias, competência, equipe, ponto, documentos e eventos. `EducaAula.execution_status` inicia em `PREVISTA`; chamadas históricas enviadas são interpretadas como realização. A equipe deve confirmar aulas históricas sem chamada.

Aplicar em ambiente de homologação antes de produção:

```powershell
pnpm.cmd --filter @cidadao/api exec prisma migrate deploy
pnpm.cmd --filter @cidadao/api exec prisma generate
```

É necessário configurar `DATABASE_URL` e o volume privado `STORAGE_DIR`. Não foi executada migração em banco nesta entrega.

## Referências e pendências de confirmação

Os anexos `LISTA DE PRESENÇA.xlsx`, `MONITOR - FOLHA DE PONTO.xlsx`, `MONITOR - FOLHA DE PONTO 28.10.pdf`, `DESCRIÇÃO DE CADA SERVIÇO.docx` e o CSV de prestação são referências de estrutura, sem importação automática. O CSV possui apenas cabeçalhos. Divergências observadas nos exemplos — cargo, dia 31 em setembro, finais de semana, CNPJ em matrícula, intervalos, textos truncados, kit lanche sem unidade/quantidade e referências externas da planilha — exigem revisão humana dos originais. Nenhuma rubrica ou assinatura de exemplo é copiada.

Ainda faltam o termo e o plano de trabalho específicos, aditivos, metas pactuadas, rubricas, regras do concedente, periodicidade, prazos, responsáveis, critérios de aplicabilidade, extratos e saldo inicial. O valor informado para serviços nos anexos não define por si só periodicidade, unidade ou quantidade; o cadastro deve ser conferido pela organização antes de vincular despesas.

## Limitações atuais

- A relação de serviços ainda depende de cadastro manual dos vínculos; a importação assistida dos textos do DOCX e a IA ficam para a etapa seguinte.
- A conciliação bancária e os rateios entre projetos ou competências não são editados neste fluxo. Sem saldo inicial e extrato, o sistema informa `não conciliado`.
- O relatório do objeto aceita atividades, resultados, desvios e justificativas revisados pela equipe. A comparação com metas permanece indisponível até integração das metas aprovadas. Fontes documentais podem ser vinculadas pela API; a seleção visual ainda precisa ser concluída.
- O XLSX contém dados editáveis e não depende de referências externas. Presença, ponto e financeiro têm fórmulas úteis; os modelos ainda não reproduzem toda a estrutura matricial dos anexos.
- O ZIP é transmitido por stream. Não há fila persistida, status ou recuperação de falha para exportações grandes.
- O PDF assinado é preservado como evidência. A verificação criptográfica de assinatura não está implementada.
- O controle de concorrência protege a transição de fechamento do registro principal; lançamentos filhos simultâneos ainda precisam de transação/versão compartilhada.
