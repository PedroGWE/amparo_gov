# Prestação de Contas por projeto

## Estrutura reaproveitada

- Interface: Next.js 14, React, SWR e Tailwind. A aba usa o `ProjectWorkspace` e o `MonthlyWorkspace` já existentes.
- API: NestJS e Prisma/PostgreSQL. A competência mensal, os requisitos, os eventos e os documentos gerados continuam nas tabelas mensais existentes.
- Projeto e instrumento: `Project` pertence ao tenant; `AccountabilityInstrument` pertence ao projeto. A nova guarda confere tenant e vínculo do usuário ao projeto em todas as rotas mensais.
- Financeiro: `Transaction` continua como lançamento principal; `AccountabilityExpense` registra sua conferência, e `AccountabilityPayment` permite parcelas e conciliação com `AccountStatement`.
- Execução: turmas, aulas e frequência vêm do Educa. Relatos, ponto, requisitos e snapshots continuam no fechamento mensal. As validações novas são registradas por etapa e revisão.
- Arquivos: `Document` e os documentos gerados do módulo mensal usam o armazenamento local configurado por `STORAGE_DIR`. O ZIP existente agrega o dossiê.
- Notificações: a devolução gera `Notification` para o gestor do projeto. O comando de avisos envia a entrega interna aos responsáveis cadastrados e evita duplicar o aviso da mesma competência.
- Resultados: metas cadastrais são reaproveitadas de `ProjectIndicator`; as medições mensais ficam em `AccountabilityIndicatorResult`, com versão do plano, método e evidências.
- Mídias: `AccountabilityMedia` referencia o arquivo do projeto e, quando informado, a aula. A liberação pública exige `metadata.public_release_approved` no documento.

## Ativação

Executar a migração `20261117120000_project_accountability` com `DATABASE_URL` do ambiente e gerar o Prisma Client. Vincular o instrumento `994898` ao projeto real Movimento Cidadão pela aba. O vínculo reaproveita o cadastro de mesmo número, projeto e tenant.

Antes de liberar despesas, confirmar a versão aprovada do plano, as rubricas e seus saldos, a conta específica e os documentos exigidos. O tipo do instrumento, a vigência, o termo assinado, o concedente, os responsáveis, os prazos oficiais e a aplicabilidade da Portaria MESP nº 16/2026 dependem de conferência documental. A regra de 75% e 25% permanece apenas como simulação visual. Versões em análise não substituem a versão aprovada que rege a execução.

## Limites atuais

O novo controle não executa a operação bancária. A vinculação de evidências usa IDs dos documentos já cadastrados. O pacote ZIP e os documentos nominais exigem permissão de beneficiários; o painel mensal retira nomes e identificadores individuais dos usuários sem essa permissão. Ainda não há automação de vencimentos, retenção documental por instrumento, gestão completa de aditivos ou importação automática de extratos nesta aba.
