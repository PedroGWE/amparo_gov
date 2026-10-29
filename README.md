# Semevo

Plataforma SaaS brasileira de gestão de projetos sociais para OSCs, Institutos, Fundações e Associações.

## Visão Geral

O **Semevo** é uma solução completa para organizações do terceiro setor gerenciarem projetos, recursos financeiros, captação de recursos, prestação de contas e impacto social - tudo em um único lugar.

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Backend | NestJS 10 + Fastify |
| Frontend | Next.js 14 + React 18 |
| Banco de Dados | PostgreSQL 16 padrão + Prisma ORM 5 |
| Cache | Redis 7 |
| Autenticação | JWT (access + refresh tokens) |
| Validação | Zod + class-validator |
| Estado (frontend) | Zustand + SWR |
| UI | Tailwind CSS + Lucide React |
| Monorepo | pnpm workspaces + Turbo |
| Infra | Docker + Nginx + PM2 |

## Estrutura do Monorepo

```
cidadao_do_futuro/
├── apps/
│   ├── api/          # API REST (NestJS)
│   └── web/          # Aplicação Web (Next.js)
├── packages/
│   ├── shared/       # Tipos e schemas compartilhados
│   └── ui/           # Componentes React compartilhados
├── infra/
│   ├── docker/       # Docker Compose
│   ├── nginx/        # Configuração Nginx
│   ├── pm2/          # Configuração PM2
│   └── scripts/      # Scripts de deploy
└── docs/             # Documentação
```

## Início Rápido

### Pré-requisitos

- Node.js >= 20
- pnpm >= 9
- Docker e Docker Compose

### Setup

```bash
# 1. Clonar o repositório
git clone https://github.com/PedroGWE/cidadao-do-futuro.git
cd cidadao-do-futuro

# 2. Instalar dependências
pnpm install

# 3. Configurar variáveis de ambiente
cp apps/api/.env.example apps/api/.env
cp infra/docker/.env.example infra/docker/.env

# 4. Subir toda a aplicação
docker compose --env-file infra/docker/.env -f infra/docker/docker-compose.yml up -d --build

# 5. Em instalação nativa, aplicar migrations e cadastros padrão
pnpm --filter @cidadao/api exec prisma migrate deploy
pnpm --filter @cidadao/api db:seed

# 6. Iniciar em desenvolvimento
pnpm dev
```

A API estará disponível em `http://localhost:3001` e o frontend em `http://localhost:3000`.

### Comandos Úteis

```bash
pnpm dev           # Inicia todos os apps em modo desenvolvimento
pnpm build         # Build de todos os pacotes
pnpm db:generate   # Regenera o Prisma Client
pnpm db:migrate    # Executa migrações do banco
pnpm db:studio     # Abre o Prisma Studio
```

## Módulos Implementados

- **Autenticação** — Login, registro, refresh token, JWT multi-tenant
- **Tenants** — Gestão de organizações, convites, papéis e permissões
- **Projetos** — Ciclo completo: fases, tarefas, membros, riscos, indicadores
- **Financeiro** — Transações, orçamentos, ordens de pagamento, notas fiscais
- **Beneficiários e professores** — Cadastros, vínculos e jornadas
- **Documentos** — Upload, download, validade e substituição segura
- **Editais e parcerias** — Oportunidades, parceiros e propostas
- **Prestação de contas** — Consolidação rastreável e exportação CSV
- **Relatórios** — Indicadores reais e exportação
- **Dashboard** — KPIs consolidados por organização

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Roadmap de Melhorias](docs/ROADMAP.md)
- [Deploy](docs/DEPLOY.md)
- [Operação, backup e restauração](docs/OPERATIONS.md)
- [Matriz funcional](docs/FUNCTIONAL_MATRIX.md)
- [Registro de validação](docs/VALIDATION.md)
- [Oportunidades e recursos para projetos sociais](docs/social-resources.md)

## Licença

Proprietário — todos os direitos reservados.
