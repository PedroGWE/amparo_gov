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

echo "=== 3. Build da API ==="
cd apps/api
pnpm build
cd "$REPO_DIR"

echo "=== 4. Migrations Prisma ==="
cd apps/api
npx prisma migrate deploy
cd "$REPO_DIR"

echo "=== 5. Build do Web ==="
cd apps/web
pnpm build
cd "$REPO_DIR"

echo "=== 6. Proxy reverso gerenciado pelo Traefik Swarm ==="

echo "=== 7. Reiniciando processos PM2 ==="
pm2 startOrRestart infra/pm2/ecosystem.config.js --only cidadao-api --env production --update-env
pm2 delete cidadao-web 2>/dev/null || true
pm2 start infra/pm2/ecosystem.config.js --only cidadao-web --env production
pm2 save

echo "=== 7. Verificando saúde dos serviços ==="
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

echo "=== Deploy concluído! ==="
