# Deploy em Produção

## Instalação atual (Hostinger)

- Host: `72.60.248.57` (`app.amparogov.org`).
- Repositório: `/var/www/cidadao-futuro`.
- Processos: `cidadao-api` e `cidadao-web` sob PM2.
- PostgreSQL e Redis: serviços locais, sem publicação externa do banco.
- HTTP/HTTPS: Traefik Swarm com certificado Let's Encrypt e rota definida em `infra/docker/docker-stack.production.yml`.
- Backups de deploy: `/var/backups/semevo/<data-hora>/` com dump, ambientes protegidos e release anterior.

Nunca registre senha SSH ou conteúdo de `.env` neste documento ou no Git.

## Pré-requisitos no Servidor

- Ubuntu 22.04 LTS (ou similar)
- Node.js 20 LTS
- pnpm 9
- PM2
- PostgreSQL 16 padrão (local ou externo; sem extensão obrigatória)
- Redis 7 (local ou externo)

## Configuração Inicial do Servidor

```bash
# Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar pnpm
npm install -g pnpm

# Instalar PM2
npm install -g pm2

```

## Deploy da Aplicação

```bash
# 1. Clonar o repositório
git clone https://github.com/PedroGWE/cidadao-do-futuro.git /var/www/cidadao-futuro
cd /var/www/cidadao-futuro

# 2. Instalar dependências
pnpm install --frozen-lockfile

# 3. Configurar variáveis de ambiente
cp apps/api/.env.example apps/api/.env
# Editar apps/api/.env com as credenciais de produção

# 4. Build
pnpm build

# 5. Rodar migrations (NUNCA use migrate dev em produção)
cd apps/api
npx prisma migrate deploy
cd /var/www/cidadao-futuro

# 6. Iniciar com PM2
pm2 start infra/pm2/ecosystem.config.js
pm2 save
pm2 startup
```

## Configuração do proxy reverso

```bash
# Aplicar a rota de app.amparogov.org no Traefik Swarm
sudo docker stack deploy -c infra/docker/docker-stack.production.yml cidadao-futuro
```

O Traefik emite e renova o certificado TLS automaticamente. A configuração do
stack também está copiada no VPS em `/root/cidadao-futuro/docker-stack.yml`.

## Variáveis de Ambiente de Produção (`apps/api/.env`)

```env
NODE_ENV=production
PORT=3001

# Banco de dados
DATABASE_URL=postgresql://usuario:senha@host:5432/semevo?schema=public

# JWT — gerar com: openssl rand -base64 64
JWT_SECRET=gerar-segredo-forte-aqui
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=gerar-outro-segredo-forte-aqui
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_URL=redis://:senha@localhost:6379

# CORS
CORS_ORIGINS=https://app.amparogov.org
```

## Atualização (Deploy Contínuo)

O workflow `.github/workflows/ci-cd.yml` valida pull requests e pushes para
`main`. Depois que lint, testes e build passam em um push para `main`, o job de
deploy acessa o VPS por SSH e executa `infra/scripts/deploy.sh`.

O ambiente `production` do GitHub Actions utiliza estes secrets:

- `SSH_HOST`: host ou IP do VPS.
- `SSH_USER`: usuário de deploy no VPS.
- `SSH_PRIVATE_KEY`: chave SSH privada exclusiva da automação.
- `SSH_KNOWN_HOSTS`: chave pública do host no formato de `known_hosts`.

O deploy também pode ser iniciado manualmente em **Actions > CI/CD > Run
workflow**. Pull requests executam somente a validação e nunca fazem deploy.

```bash
cd /var/www/cidadao-futuro
git pull origin main
pnpm install --frozen-lockfile
pnpm build
cd apps/api && npx prisma migrate deploy && cd /var/www/cidadao-futuro
pm2 restart all
```

Ou usando o script incluído:

```bash
bash infra/scripts/deploy.sh
```

## Monitoramento

```bash
pm2 status          # Status dos processos
pm2 logs            # Logs em tempo real
pm2 monit           # Dashboard de monitoramento
```

## Backup do Banco de Dados

```bash
# Backup manual
pg_dump -U postgres semevo > backup_$(date +%Y%m%d).sql

# Restaurar backup
psql -U postgres semevo < backup_20250101.sql
```

Recomenda-se configurar backup automático diário via cron:

```bash
0 3 * * * pg_dump -U postgres semevo | gzip > /backups/semevo_$(date +\%Y\%m\%d).sql.gz
```

## Migrations do Prisma

> **Atenção**: em produção sempre use `npx prisma migrate deploy`. Nunca use `prisma migrate dev` em produção — ele pode solicitar confirmações interativas e criar/apagar migrations indesejadas.

### Como funciona hoje

As migrations ficam em `apps/api/prisma/migrations/` e são versionadas no Git. O arquivo `migration_lock.toml` garante que o mesmo provider (PostgreSQL) seja usado em todos os ambientes.

### Criar uma nova migration (desenvolvimento)

```bash
cd apps/api
# Gera a migration a partir das alterações no schema.prisma
npx prisma migrate dev --name nome_descritivo_da_alteracao

# Regenera o Prisma Client
npx prisma generate
```

Exemplo: `npx prisma migrate dev --name add_indice_beneficiarios_cpf`

Commitar os arquivos gerados em `prisma/migrations/` junto com a alteração no `schema.prisma`.

### Aplicar migrations (produção / staging)

```bash
cd apps/api
npx prisma migrate deploy
```

Este comando:
1. Verifica migrations já aplicadas na tabela `_prisma_migrations`.
2. Aplica apenas as pendentes em ordem.
3. Falha segura: se uma migration falhar, o deploy para e nenhuma migration posterior é aplicada.

### Baseline em banco já existente

Se o banco de produção já foi criado sem Prisma Migrate (caso atual), siga este procedimento **uma única vez**:

1. **Faça backup completo do banco antes de qualquer operação.**
2. Verifique o drift entre o banco e o schema:
   ```bash
   cd apps/api
   npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma
   ```
3. Se o comando acima retornar diferenças (drift), **NÃO prossiga**. Resolva o drift primeiro (veja próxima seção).
4. Se não houver drift, marque a baseline como já aplicada:
   ```bash
   npx prisma migrate resolve --applied 20250711000000_baseline
   ```
5. Valide:
   ```bash
   npx prisma migrate status
   ```

A partir daí, novas migrations serão aplicadas normalmente com `npx prisma migrate deploy`.

### Verificação de drift

Drift ocorre quando o banco de produção difere do `schema.prisma`. Para verificar:

```bash
cd apps/api
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma
```

- **Saída vazia**: banco está sincronizado com o schema.
- **Saída com `CREATE`/`ALTER`/`DROP`**: há drift. Não aplique migrations até resolver.

#### Plano de conciliação em caso de drift

1. Identifique as diferenças com o comando acima.
2. Escolha uma das estratégias:
   - **(A)** Ajustar o `schema.prisma` para refletir o banco real, gerar nova migration e aplicar.
   - **(B)** Alterar o banco manualmente (com backup) para refletir o schema, depois aplicar baseline.
3. Em ambos os casos, teste em um ambiente de staging/cópia antes de tocar produção.
4. Documente qualquer alteração manual no banco no runbook de operações.

### Como reverter (rollback)

Prisma Migrate **não reverte automaticamente** migrations aplicadas. O rollback deve ser planejado:

1. **Antes de aplicar**: gere o SQL de rollback manualmente:
   ```bash
   cd apps/api
   npx prisma migrate diff --from-migration <nome_da_migration> --to-migration <migration_anterior> --script > rollback_<nome>.sql
   ```
2. Em caso de problema, restaure a partir do backup do banco (método recomendado para produção):
   ```bash
   pg_restore -U postgres -d cidadao_futuro --clean backup_YYYYMMDD.sql
   ```
3. Para alterações pequenas e reversíveis, mantenha um arquivo `rollback_*.sql` versionado junto da migration.

### Validação local com Docker

Para subir um PostgreSQL limpo e validar que as migrations recriam o schema:

```bash
# Subir postgres
docker compose -f infra/docker/docker-compose.yml up -d postgres

# Aguardar saúde
sleep 5

# Aplicar migrations em banco vazio
cd apps/api
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cidadao_futuro_test?schema=public" npx prisma migrate deploy

# Verificar status
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cidadao_futuro_test?schema=public" npx prisma migrate status
```
