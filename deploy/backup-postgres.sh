#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Naori — Backup diário do Postgres para Cloudflare R2
# ─────────────────────────────────────────────────────────────────────────────
#  O que faz:
#    1. Faz pg_dump comprimido do container postgres
#    2. Envia para o R2 no bucket configurado em BACKUP_R2_REMOTE
#    3. Apaga dumps locais e remotos com mais de BACKUP_RETENTION_DAYS dias
#
#  Rodar manualmente:
#       cd /opt/naori && bash deploy/backup-postgres.sh
#
#  Agendamento automático (cron diário às 03:30):
#       crontab -e
#       30 3 * * * cd /opt/naori && /opt/naori/deploy/backup-postgres.sh >> /var/log/naori-backup.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Ler .env da raiz do projeto
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
ENV_FILE="${PROJECT_ROOT}/.env"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-naori}"
POSTGRES_DB="${POSTGRES_DB:-restai}"
BACKUP_R2_REMOTE="${BACKUP_R2_REMOTE:-r2:naori-backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-/var/backups/naori}"

mkdir -p "${LOCAL_BACKUP_DIR}"

# Nome com timestamp UTC
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
DUMP_FILE="${LOCAL_BACKUP_DIR}/naori-${TIMESTAMP}.sql.gz"

echo "[$(date -Iseconds)] Iniciando backup..."

# 1. pg_dump dentro do container postgres → comprime → grava local
cd "${PROJECT_ROOT}"
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
    --no-owner --no-privileges --clean --if-exists --quote-all-identifiers \
  | gzip -9 > "${DUMP_FILE}"

DUMP_SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
echo "[$(date -Iseconds)] Dump local criado: ${DUMP_FILE} (${DUMP_SIZE})"

# 2. Upload para R2 (se rclone configurado)
if rclone listremotes 2>/dev/null | grep -q "^${BACKUP_R2_REMOTE%%:*}:"; then
  echo "[$(date -Iseconds)] Enviando para ${BACKUP_R2_REMOTE}..."
  rclone copy "${DUMP_FILE}" "${BACKUP_R2_REMOTE}/" --quiet
  echo "[$(date -Iseconds)] Upload concluído."

  # 3. Limpa dumps remotos antigos
  echo "[$(date -Iseconds)] Removendo backups remotos com mais de ${BACKUP_RETENTION_DAYS} dias..."
  rclone delete "${BACKUP_R2_REMOTE}/" \
    --min-age "${BACKUP_RETENTION_DAYS}d" \
    --include "naori-*.sql.gz" \
    --quiet || true
else
  echo "[$(date -Iseconds)] AVISO: rclone remote '${BACKUP_R2_REMOTE%%:*}' não configurado. Backup ficou só local."
  echo "                Configure com: rclone config (veja deploy/setup-backup.sh)"
fi

# 4. Limpa dumps locais antigos
find "${LOCAL_BACKUP_DIR}" -name "naori-*.sql.gz" -mtime "+${BACKUP_RETENTION_DAYS}" -delete
echo "[$(date -Iseconds)] Backup concluído com sucesso."
