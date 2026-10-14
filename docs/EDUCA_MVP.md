# Educa Amparo Gov — MVP

Implementação no mesmo monorepositório, API e PostgreSQL do Amparo Gov. Não houve implantação em servidor externo.

## Ativação

1. Faça backup do banco e do volume de arquivos antes da atualização.
2. Instale as dependências com a versão de pnpm indicada no package.json.
3. Gere o Prisma Client e aplique as migrations:
   ```sh
   pnpm --filter @cidadao/api exec prisma generate
   pnpm --filter @cidadao/api exec prisma migrate deploy
   pnpm build
   ```
4. Reinicie a API e o frontend. Mantenha STORAGE_DIR em volume persistente e HTTPS na publicação.
5. O gestor administrador acessa o item **Educa Amparo Gov** no menu. Outros gestores precisam da permissão `educa:manage`.
6. Em Acessos, selecione um beneficiário ou professor já cadastrado. Defina matrícula/senha do aluno ou e-mail/senha do professor. A ação também permite redefinir senhas. Não há cadastro público de alunos ou professores.
7. Crie uma turma, selecione o professor com acesso e opcionalmente vincule um projeto. Abra a turma e matricule os beneficiários na aba Alunos.
8. Compartilhe a rota `/educa`, o identificador do instituto e as credenciais por canal seguro. O aluno não precisa ter e-mail real. O e-mail técnico `.invalid` existe apenas para compatibilidade com a tabela users e não recebe mensagens.

## Rotas

- `/educa`: entrada do aluno ou professor.
- `/:tenant/professor`: portal de ensino.
- `/:tenant/aluno`: portal de aprendizagem.
- `/:tenant/educa`: gestão de acessos, turmas e chamadas.
- Rotas antigas de professor/aluno redirecionam ao portal unificado, onde as abas funcionais ficam dentro de cada turma.

## Aulas e chamada

O professor agenda uma aula com início, fim e link válido do Google Meet criado manualmente. O botão abre o Meet em outra aba. Não existe criação automática de reuniões, incorporação de vídeo, gravação ou leitura automática dos participantes do Meet neste MVP.

Cada aula possui uma chamada própria, inclusive duas aulas da mesma turma no mesmo dia. O professor marca PRESENTE, AUSENTE ou JUSTIFICADA. Pode salvar rascunho parcial. O envio exige todos os alunos ativos marcados e bloqueia novas alterações até o gestor reabrir. Controle de versão impede sobrescrita concorrente; envio e registros são gravados em uma transação. As ações ficam no AuditLog.

O envio publica os registros imediatamente na tela do gestor porque o Educa compartilha o banco do Amparo Gov. Não há transferência para outro sistema ou envio de e-mail. Rascunhos não entram como chamada consolidada. Abrir o Meet não comprova presença. O gestor consulta cada aula, lista nominal e situação, e pode reabrir para correção.

A matrícula de login é única por instituto e é diferente do vínculo Matricula de um aluno em cada turma. O vínculo User ↔ Beneficiary substitui a identificação incorreta por created_by. Turma.professor_id permanece sendo o ID do usuário do professor, associado explicitamente ao cadastro Professor.user_id.

## Materiais e atividades

- Professor compartilha texto e arquivo PDF/JPG/PNG de até 10 MB.
- Professor publica atividade com enunciado e prazo opcional.
- Aluno envia texto e até cinco anexos de 10 MB, um por envio. Reenvios preservam os anexos anteriores e são permitidos até a avaliação.
- Entregas após o prazo são aceitas e identificadas pela data de envio.
- Professor avalia com nota opcional de 0 a 10 e comentário; sem nota, pode marcar como concluída.
- Aluno consulta apenas suas entregas e avaliações.
- Arquivos ficam em STORAGE_DIR/educa e são baixados por endpoint autenticado. A aplicação verifica formato, assinatura inicial e tamanho; não inclui antivírus.

## Validações realizadas nesta entrega

- Prisma Client gerado e schema validado.
- TypeScript da API e frontend aprovado.
- Compilação da API aprovada.
- Build de produção Next.js aprovado.
- Jest: 10 suítes, 72 testes aprovados, incluindo 11 novos testes do Educa com persistência simulada.
- As três migrations foram executadas em ordem em PostgreSQL embutido PGlite, sem alteração dos scripts. As quatro tabelas Educa foram criadas.

A conferência visual automatizada não foi concluída: o navegador Chromium não estava instalado e seu download retornou arquivo inválido.

PGlite não substitui a homologação com Prisma conectado ao PostgreSQL do servidor. Não foi executado o fluxo completo autenticado contra esse servidor nem uma chamada real no Google Meet. As migrations existentes do repositório foram preservadas.

## Limites do MVP

Sem portal de responsáveis, gravações, notificações externas, certificados, criação automática de links Meet ou edição de aulas já agendadas. Público de todas as idades, utilizando o cadastro de beneficiários e os procedimentos do instituto. A sessão mantém o mecanismo de cookies existente no projeto; migração completa para cookies HttpOnly é uma melhoria de infraestrutura pendente. Antes de uso público, homologar sessões, backup, HTTPS e a jornada completa com contas reais de teste.
