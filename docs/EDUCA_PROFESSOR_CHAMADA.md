# Acesso do professor e início da chamada no Educa

## Fluxo de teste

1. O gestor cadastra o professor em **Professores** e o mantém ativo.
2. Em **Educa → Acessos**, seleciona o cadastro do professor e define e-mail e senha individual. O acesso recebe a permissão `conecta:teacher` no tenant. Uma conta existente recebe o papel Educa sem duplicação.
3. Em **Educa → Turmas**, o gestor vincula o professor com acesso e matricula os alunos. A turma só aparece para o professor vinculado.
4. O professor entra em `/educa`, escolhe **Sou professor** e informa instituto, e-mail e senha. Na tela inicial, toca em **Abrir chamada**. Se ainda não houver aula, pode criá-la na própria seção Chamada. O link do Google Meet é opcional para aulas presenciais.
5. Na aula, informa a data e o horário em que ela começou e toca em **Iniciar aula e abrir chamada**. O horário planejado continua separado. O início é persistido com autor e controle de versão.
6. Marca cada aluno da turma como presente, ausente ou com falta justificada. Pode salvar rascunho. O envio exige início confirmado e situação de todos os alunos ativos.
7. Ao confirmar o envio, a chamada fica disponível em **Educa → Chamadas recebidas** para o gestor, com horário de início, data de envio e registros por aluno. Só o gestor pode reabrir uma chamada enviada para correção.

O professor não recebe acesso às turmas de outros professores ou de outro tenant. Um cadastro inativo não pode entrar no portal. A hora de início não é inferida do planejamento e nenhuma presença é preenchida automaticamente.

## Migração e validação

A migration `20261103100000_educa_lesson_start` adiciona `actual_started_at` e `started_by` à aula. Após aplicá-la, executar `prisma generate` no pacote da API. Chamadas históricas permanecem visíveis; aquelas anteriores a este controle não recebem um horário de início inventado.

Use duas contas sintéticas para testar o isolamento: professor vinculado à turma e professor sem vínculo. Depois do teste, a integração dos professores reais requer selecionar os cadastros existentes, conferir e-mails, ativação, turmas e matrículas. Não foram criadas contas reais nesta alteração.
