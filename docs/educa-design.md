# Educa Amparo GOV

Revisão da experiência de aluno, professor e gestor inspirada na referência fornecida pelo cliente (`Portal do professor Educa Amparo GOV.png`). A identidade usa livro aberto, azul, verde e amarelo, superfícies claras e cartões arredondados. Logo vetorial, ilustração e ícones ficam em `apps/web/public/brand/educa`.

## Navegação e uso

- Visão geral com dados reais das turmas autorizadas, próxima aula, materiais e pendências. Nenhuma demonstração é gravada na base.
- Seções e turma selecionada persistem na URL (`aba`, `turma`, `aula`, `atividade`). Endereços antigos redirecionam para a seção correspondente.
- Professor: planejamento com Google Meet, publicação de materiais e atividades, correção com nota e feedback, chamada com busca, marcação coletiva, rascunho e revisão antes do envio.
- Aluno: aulas, biblioteca, respostas com texto ou anexos, avaliação na própria atividade, frequência e matrícula de acesso no perfil.
- Gestor: preservados os cadastros de turma, vínculos, criação/redefinição de acessos e reabertura de chamada.
- Alterações não salvas em chamadas, atividades e formulários de publicação pedem confirmação ao navegar ou sair. Atualizações do resumo não apagam esses rascunhos locais.
- Menu responsivo, foco de teclado, opção de mostrar senha, ajuda contextual e mensagens de erro/retorno. O menu fechado fica fora da navegação por teclado.

## Integração

`GET /educa/resumo` reutiliza o escopo de turmas da conta autenticada. As consultas exigem organização e IDs autorizados; para alunos, entregas e presenças são filtradas pelo usuário. A rota não expõe respostas, notas ou nomes de colegas.

Os endpoints existentes continuam responsáveis por autorização, versões de chamada e validação de anexos. O limite educacional permanece em cinco anexos por entrega e 10 MB por arquivo (PDF, JPG e PNG), conforme a API. Não há alteração de esquema ou migração.

O domínio `educa.amparogov.org` usa favicon, ícone Apple e manifesto próprios, inclusive nos endereços padrão solicitados pelo navegador. As demais áreas mantêm a identidade Amparo GOV.

## Validação

Testes de serviço verificam escopo por organização, turmas do professor, entregas/presenças individuais e contagem de alunos distintos. Testes web verificam navegação por perfil, redirecionamentos antigos, favicon por domínio e estados de atividade.

Fluxos no navegador com dados fictícios isolados: envio e proteção de rascunho de chamada, avaliação, agendamento, resposta do aluno, feedback, recarga de URL, login e navegação a 390 px. Revisão visual em desktop e celular. Nenhum dado fictício é enviado à produção.
