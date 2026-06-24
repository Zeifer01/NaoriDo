#!/usr/bin/env sh
# Extrai a URL pública do Cloudflare Quick Tunnel a partir dos logs do container.
set -e

CONTAINER="${1:-naori-cloudflared-1}"
MAX_WAIT="${2:-60}"

echo "Aguardando URL do túnel (até ${MAX_WAIT}s)..."

i=0
while [ "$i" -lt "$MAX_WAIT" ]; do
  URL=$(docker logs "$CONTAINER" 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  if [ -n "$URL" ]; then
    echo "$URL"
    exit 0
  fi
  sleep 2
  i=$((i + 2))
done

echo "URL do túnel não encontrada. Verifique: docker compose --profile tunnel logs cloudflared" >&2
exit 1
