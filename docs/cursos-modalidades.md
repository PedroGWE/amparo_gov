# Cursos, modalidades e matrículas

A aba **Cursos e modalidades** organiza as atividades separadamente dos projetos de financiamento. Cada curso ou modalidade pode receber vários projetos, emendas e editais. As emendas e os editais dos projetos vinculados aparecem automaticamente; os vínculos adicionais são opcionais.

Ao selecionar uma atividade na listagem, abre-se sua página de gestão em `/{organizacao}/cursos/{id}`, com a mesma organização de navegação dos projetos: **Visão geral**, **Alunos**, **Turmas e vagas**, **Matrículas e reserva**, **Projetos e recursos** e **Dados da atividade**. As abas possuem endereço próprio e continuam selecionadas ao recarregar. Links antigos com `?curso={id}` redirecionam à página correspondente.

Em **Matrículas e reserva**, a gestão mostra somente as turmas da atividade aberta. É possível matricular um aluno existente vinculado à atividade, conferir sua inscrição, encerrar a matrícula ou excluir a inscrição. Se a turma estiver completa, a nova inscrição entra na reserva. A aba geral **Matrículas** continua disponível para consultar todas as turmas da organização.

Em **Criar turmas**, informe o nome, a quantidade de turmas e as vagas por turma. O projeto escolhido deve estar vinculado ao curso. O formulário permite até 50 turmas por operação e 10.000 vagas por turma. A quantidade de turmas efetivamente criadas e suas capacidades permanecem visíveis na página.

O link `/{organizacao}/inscricao?curso={id}` oferece somente as turmas daquele curso. O parâmetro adicional `turma={id}` abre a inscrição de uma turma específica. Os links continuam recebendo inscrições quando as vagas se esgotam: os alunos entram na reserva da turma em ordem de chegada. Encerrar ou excluir uma matrícula ativa, ou ampliar a capacidade, promove os primeiros da reserva automaticamente. A operação usa bloqueio transacional da turma para impedir excesso de vagas em inscrições simultâneas. Diminuir a capacidade preserva os alunos já matriculados.

Na aba **Convites**, copie o link geral ou os convites com `perfil=aluno`, `perfil=responsavel` e `perfil=professor`. O perfil seleciona quem preenche a inscrição do aluno e pode ser alterado no formulário. Também há links diretos para cada turma e compartilhamento por WhatsApp. Todos abrem sem login.

Cada convite usa imagem e cores da atividade, identificadas pelo nome ou escolhidas em **Imagem e cores do convite**. Clique em **Salvar identidade** para publicar a escolha. A página fornece título, descrição e imagem de compartilhamento no HTML inicial, inclusive para prévias de mensagens. As capas são ilustrativas. A migração `20261023120000_course_invitation_visual` acrescenta somente o campo opcional de identidade visual, preservando matrículas e capacidades existentes.

Um curso pode ficar inativo ou ter suas inscrições encerradas pela edição. O servidor também rejeita envios diretos para cursos indisponíveis e turmas incompatíveis com o curso informado. Os dados e os vínculos administrativos são sempre limitados à organização autenticada.

Na aba **Matrículas**, a edição da turma permite vincular uma turma existente a um curso ou modalidade. As turmas sem modalidade identificada permanecem disponíveis nessa aba. Alunos já cadastrados podem se inscrever em outro curso informando CPF, nome e nascimento correspondentes, sem criar outro cadastro pessoal.

## Atualização a partir do relatório de 22/10/2026

O script `apps/api/scripts/import-cidadao-courses-report.cjs` é específico da organização `cidadaodofuturo` e verifica os identificadores dos registros existentes. Sem argumentos, apenas exibe o plano. Com `--apply`, faz backup completo do banco antes de atualizar os dados em uma transação e grava auditoria em `/var/backups/semevo/courses-report-*`.

O relatório fornecido identifica quatro instrumentos, que totalizam R$ 888.000,00, duas emendas com autoria confirmada e seis editais em sete versões documentais. Os editais são seleções de fornecedores da própria OSC. Versões e itens sobrepostos não são somados ao orçamento dos projetos. Os valores homologados não geram despesas ou pagamentos financeiros no sistema.

O importador atualiza os quatro projetos existentes, preserva os códigos usados na integração e corrige o vínculo de cada registro do Transferegov ao projeto correspondente, sem alterar os campos oficiais sincronizados. Os estados operacionais dos dois instrumentos com vigência encerrada são `CONCLUIDO`; a situação da prestação de contas permanece explicitada na descrição e nos dados de financiamento, sem afirmar aprovação das contas.

Os sete antigos cadastros de atividades tornam-se referências históricas dos novos cursos e modalidades, mantendo todos os vínculos anteriores com alunos e professores. A listagem principal de Projetos passa a exibir os financiamentos; os seletores de vínculos históricos de alunos e professores usam `include_legacy=true`. Apenas a turma explicitamente nomeada Pilates recebe essa modalidade automaticamente. As turmas genéricas não recebem modalidade presumida.

O script é repetível, não cria turmas ou capacidades presumidas e verifica que os totais de alunos, documentos e matrículas, os nomes das turmas e suas capacidades foram preservados.

## Alunos de cada atividade

Os beneficiários possuem vínculos diretos com cursos e modalidades, independentemente da matrícula em uma turma. A migração `20261023010000_link_course_students` recupera os vínculos anteriores pelo projeto de atividade original, pelos vínculos ativos de beneficiário/projeto e pelas matrículas ativas em turmas com curso definido. O aluno pode estar em várias atividades e aparece uma única vez em cada lista. Projetos de financiamento compartilhados não determinam a modalidade do aluno.

Cada atividade mostra o total e a lista de **Alunos vinculados**, inclusive alunos ainda sem turma definida. O nome abre o perfil do beneficiário; o perfil e a listagem geral exibem seus cursos e modalidades. O botão **Vincular aluno existente** permite acrescentar um vínculo sem criar outra pessoa ou alterar a ocupação das turmas.

Novas matrículas ativas e promoções da reserva também vinculam o aluno à atividade da turma. Vincular uma turma existente a um curso inclui os alunos já matriculados. Entrar na reserva, por si só, não cria um vínculo de participação ativa. Os vínculos com uma atividade são preservados ao encerrar uma turma, como histórico de participação.
