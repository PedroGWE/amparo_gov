# Gestão do projeto em página completa

Atualização: 14/10/2026.

## Comportamento

Na listagem de Projetos, clicar no nome ou na linha abre `/{tenant}/projetos/{projectId}`. A gestão deixa de depender do modal com largura máxima de 672 px e rolagem interna. A criação de um projeto também encaminha para sua página de gestão.

A página possui oito seções, selecionadas pelo parâmetro `aba` na URL:

| Seção | Parâmetro | Funções |
| --- | --- | --- |
| Visão geral | `resumo` | Progresso das atividades, atrasos, alunos, orçamento, próximas entregas e objetivo do projeto. |
| Plano de trabalho | `planejamento` | Cadastro de etapas e atividades, definição de responsável, prioridade e prazo, atualização de situação e filtros. |
| Alunos e turmas | `alunos` | Vínculos de beneficiários, criação de turmas e matrículas. |
| Chamada | `chamada` | Consulta e registro de presença por turma e data. |
| Rotina | `rotina` | Cadastro e consulta das atividades de cada turma. |
| Metas e resultados | `metas` | Cadastro de indicadores e registro de medições. |
| Equipe | `equipe` | Consulta, inclusão e remoção de integrantes, usando os endpoints existentes. |
| Dados do projeto | `dados` | Edição de nome, descrição, código, área, situação, datas e orçamento planejado. |

Atualizar a página preserva a seção selecionada. Os links permitem abrir o projeto em outra aba, usar o histórico do navegador e retornar à lista.

O menu principal reconhece a rota de detalhes como parte de Projetos, pode ser recolhido no desktop e fica disponível por um botão no celular. A página usa a largura disponível e a rolagem do conteúdo principal.

## Compatibilidade

- Mantidos os endpoints e o esquema de dados existentes. Não há nova migration ou dependência da aplicação.
- A API continua responsável por autenticação, autorização e isolamento por organização.
- As ações de edição são apresentadas conforme `projects:update`; a seleção de novos integrantes também exige `users:read`.
- O controle de acesso da rota mantém a verificação de cookie usada pelas demais páginas. A API valida o token nas requisições.
- Erros de carregamento possuem uma opção de nova tentativa. A falha da consulta de chamada não é apresentada como ausência de matrículas.
- Campos de data e orçamento já preenchidos não podem ser apagados no formulário, pois a API atual não oferece limpeza desses campos. Seus valores podem ser alterados.
- O orçamento aprovado é exibido para consulta. Esta alteração não implementa novos fluxos financeiros ou de aprovação.

## Arquivos de implementação

- `apps/web/src/pages/[tenant]/projetos.tsx`
- `apps/web/src/pages/[tenant]/projetos/[projectId].tsx`
- `apps/web/src/components/projects/ProjectWorkspace.tsx`
- `apps/web/src/components/projects/ProjectManagementPanel.tsx`
- `apps/web/src/components/projects/project-utils.ts`
- `apps/web/src/components/layout/DashboardLayout.tsx`
- `apps/web/src/services/projects.ts`

## Validação

Executados nesta revisão:

- Build dos pacotes `@cidadao/shared` e `@cidadao/ui`.
- `pnpm --filter @cidadao/web exec tsc --noEmit` — aprovado.
- `pnpm --filter @cidadao/web lint` — aprovado, sem avisos ou erros.
- `pnpm --filter @cidadao/web build` — aprovado, incluindo a nova rota dinâmica.
- Verificação no navegador do frontend compilado, com respostas de API simuladas: abertura pela lista; oito seções; menu recolhível; cadastro de etapas e atividades; situação e filtro de atividades; atualização de indicador; inclusão de integrante; vínculo de aluno; chamada; rotina; edição dos dados; recarga e histórico do navegador; modo de consulta; projeto inexistente; redirecionamento sem sessão; falha e recuperação da chamada.
- Inspeção visual em desktop e celular. Verificados os oito painéis em largura de 390 px, sem transbordamento horizontal, com título legível e navegação móvel.

Os testes de interface não validam persistência em PostgreSQL, dados de produção ou integrações externas. Para homologar, executar os mesmos fluxos com uma organização de teste e a API real.
