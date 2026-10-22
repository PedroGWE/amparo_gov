#!/usr/bin/env bash
# Script de deploy para o VPS — execute como o usuário do app
set -euo pipefail

REPO_DIR="/var/www/cidadao-futuro"

cd "$REPO_DIR"

echo "=== 0. Atualizando código ==="
git fetch origin main
git pull --ff-only origin main

echo "=== 1. Instalando dependências ==="
pnpm install --frozen-lockfile

echo "=== 2. Gerando Prisma Client ==="
pnpm --filter @cidadao/api db:generate

echo "=== 3. Build do pacote compartilhado e da API ==="
# A API e o Web dependem dos arquivos compilados de @cidadao/shared.
pnpm --filter @cidadao/shared build
cd apps/api
pnpm build
cd "$REPO_DIR"


echo "=== 4. Backup do banco antes das migrations ==="
umask 077
backup_dir="/var/backups/semevo/$(date -u +%Y%m%dT%H%M%SZ)-educa"
mkdir -p "$backup_dir"
cd apps/api
backup_url="$(node <<'NODE'
const fs = require('fs')
const line = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find((item) => /^DATABASE_URL\s*=/.test(item))
if (!line) throw new Error('DATABASE_URL missing in apps/api/.env')
let raw = line.slice(line.indexOf('=') + 1).trim()
if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1)
let url
try { url = new URL(raw) } catch { throw new Error('Invalid DATABASE_URL') }
url.searchParams.delete('schema')
process.stdout.write(url.toString())
NODE
)"
pg_dump --format=custom --no-owner --file="$backup_dir/database.dump" "$backup_url"
chmod 600 "$backup_dir/database.dump"
unset backup_url
umask 022
cd "$REPO_DIR"

echo "=== 5. Migrations Prisma ==="
cd apps/api
npx prisma migrate deploy
cd "$REPO_DIR"

echo "=== 6. Build do Web ==="
cd apps/web
pnpm build
cd "$REPO_DIR"

echo "=== 7. Proxy reverso gerenciado pelo Traefik Swarm ==="

echo "=== 8. Reiniciando processos PM2 ==="
pm2 startOrRestart infra/pm2/ecosystem.config.js --only cidadao-api --env production --update-env
pm2 delete cidadao-web 2>/dev/null || true
pm2 start infra/pm2/ecosystem.config.js --only cidadao-web --env production
pm2 save

echo "=== 9. Verificando saude dos servicos ==="
healthy_checks=0
for attempt in {1..18}; do
  if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/login >/dev/null \
    && curl --silent --show-error --max-time 5 http://127.0.0.1:3001/api/v1/auth/login >/dev/null; then
    healthy_checks=$((healthy_checks + 1))
    if [ "$healthy_checks" -eq 6 ]; then
      echo "Frontend e API estáveis por 30 segundos."
      break
    fi
  else
    healthy_checks=0
  fi
  if [ "$attempt" -eq 18 ]; then
    pm2 status
    pm2 logs cidadao-web --lines 80 --nostream
    pm2 logs cidadao-api --lines 80 --nostream
    exit 1
  fi
  sleep 5
done

echo "=== 10. Atualizando rota HTTPS do Educa ==="
bash infra/scripts/deploy-proxy.sh

echo "=== Deploy concluido! ==="
