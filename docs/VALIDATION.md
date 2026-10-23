# Registro de validação

## 2026-10-23 — convites públicos de matrícula

- `pnpm lint` e tipagem do frontend: aprovados.
- API: 20 suítes e 150 testes aprovados; frontend: 27 testes aprovados.
- Build dos quatro pacotes e novo build após o ajuste de contraste: aprovados.
- Navegador com API simulada: sete identidades de atividade, prévia de compartilhamento renderizada no servidor, perfis de aluno/professor, avanço com Enter sem envio antecipado, confirmação de reserva, filtro de turma, isolamento da sessão administrativa, persistência do tema e cópia do link aprovados.
- Layouts desktop e celular verificados; nenhuma falha de JavaScript ou de carregamento de recursos no teste do navegador.
- Migração aditiva: `20261023120000_course_invitation_visual` acrescenta `cursos.tema_visual`, sem alterar inscrições ou vagas.

## 2026-10-02 — linha de base

| Comando | Resultado |
|---|---|
| `pnpm --filter @cidadao/api exec prisma validate` | aprovado |
| `pnpm --filter @cidadao/api exec prisma generate` | aprovado para o schema atual |
| `pnpm --filter @cidadao/api run lint` | falhou: módulos Beneficiários, Editais, Professores e Conecta referenciam modelos ausentes do schema atual |
| `pnpm --filter @cidadao/web exec tsc --noEmit` | falhou: erros em Beneficiários e Professores |
| `docker compose ...` | não executado: Docker não está instalado no host |

Não há declaração de sistema integralmente funcional enquanto estes itens estiverem pendentes.

## 2026-10-02 — após reconciliação

| Comando | Resultado |
|---|---|
| `prisma format && prisma validate && prisma generate` | aprovado; schema e client incluem os módulos novos |
| `pnpm --filter @cidadao/api run lint` | aprovado |
| `pnpm --filter @cidadao/web exec tsc --noEmit` | aprovado |
| `pnpm --filter @cidadao/api exec jest --runInBand` | 8 suítes, 58 testes aprovados |
| `pnpm build` | aprovado para os quatro pacotes; standalone fica habilitado somente na imagem Linux |

## 2026-10-02 — Relatórios e Configurações

- Tipagem da API e do frontend: aprovada.
- Testes: 8 suítes e 58 testes aprovados.
- Build dos quatro pacotes: aprovado.
- `git diff --check`: aprovado.
- PostgreSQL real inicialmente não estava disponível neste host.

## 2026-10-02 — PostgreSQL local e jornada de login

| Validação | Resultado |
|---|---|
| PostgreSQL 16.15 limitado a `127.0.0.1:5432` | iniciado com sucesso |
| `prisma migrate deploy` em banco `semevo` vazio | baseline aplicada com sucesso |
| seed de desenvolvimento executado duas vezes | aprovado; idempotência confirmada |
| login `demo` por HTTP na API real | `HTTP 200` |
| frontend `/login` | `HTTP 200` |
| tipagem e build frontend após identidade Semevo | aprovados |

O baseline deixou de exigir `pgvector`: o embedding opcional e ainda não operacional usa `DOUBLE PRECISION[]`, suportado pelo PostgreSQL padrão. As credenciais `demo` pertencem exclusivamente ao seed de desenvolvimento, que se recusa a executar em produção.
