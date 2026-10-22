#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
config_file="$repo_dir/infra/docker/nginx.production.conf"

# Swarm configs are immutable. A content hash creates a new config only on change.
export CIDADAO_NGINX_CONFIG_HASH
CIDADAO_NGINX_CONFIG_HASH="$(sha256sum "$config_file" | cut -c1-16)"

docker run --rm --add-host host.docker.internal:host-gateway \
  --mount "type=bind,source=$config_file,target=/etc/nginx/conf.d/default.conf,readonly" \
  nginx:alpine nginx -t

docker stack deploy --resolve-image never \
  -c "$repo_dir/infra/docker/docker-stack.production.yml" cidadao-futuro
