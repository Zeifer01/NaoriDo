#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Naori — Configura backup automático do Postgres para R2
# ─────────────────────────────────────────────────────────────────────────────
#  O que faz:
#    1. Pede as credenciais R2 e gera ~/.config/rclone/rclone.conf
#    2. Testa a conexão criando um arquivo de teste no bucket
#    3. Agenda backup diário no cron do usuário atual (não-root)
#
#  Pré-requisito:
#    - rclone já instalado (setup-vps.sh faz isso)
#    - bucket criado no Cloudflare R2 (ex: "naori-backups")
#    - token API R2 com permissão de leitura+escrita no bucket
#
#  Uso:
#       cd /opt/naori && bash deploy/setup-backup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

C="\033[1;36m"; G="\033[1;32m"; Y="\033[1;33m"; N="\033[0m"

if [[ "${EUID}" -eq 0 ]]; then
  echo -e "${Y}Aviso: rodando como root. Recomendado rodar como o usuário 'deploy'.${N}"
  read -rp "Continuar mesmo assim? [y/N] " confirm
  [[ "${confirm}" =~ ^[Yy]$ ]] || exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"

# Ler .env para já saber credenciais R2
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${PROJECT_ROOT}/.env"
  set +a
fi

echo -e "${C}━━━ Configurando rclone para Cloudflare R2 ━━━${N}\n"

read -rp "R2 Account ID [${R2_ACCOUNT_ID:-}]: " input_account
R2_ACCOUNT_ID="${input_account:-${R2_ACCOUNT_ID:-}}"

read -rp "R2 Access Key ID [${R2_ACCESS_KEY_ID:0:6}…]: " input_key
R2_ACCESS_KEY_ID="${input_key:-${R2_ACCESS_KEY_ID:-}}"

read -rsp "R2 Secret Access Key (não será exibida): " input_secret
echo
R2_SECRET_ACCESS_KEY="${input_secret:-${R2_SECRET_ACCESS_KEY:-}}"

read -rp "Nome do bucket no R2 (ex: naori-backups) [naori-backups]: " bucket
bucket="${bucket:-naori-backups}"

read -rp "Nome do remote no rclone [r2]: " remote
remote="${remote:-r2}"

if [[ -z "${R2_ACCOUNT_ID}" || -z "${R2_ACCESS_KEY_ID}" || -z "${R2_SECRET_ACCESS_KEY}" ]]; then
  echo "Credenciais incompletas. Abortando."
  exit 1
fi

# Cria config do rclone
mkdir -p "${HOME}/.config/rclone"
RCLONE_CONF="${HOME}/.config/rclone/rclone.conf"

# Remove bloco anterior do mesmo remote, se existir
if [[ -f "${RCLONE_CONF}" ]] && grep -q "^\[${remote}\]" "${RCLONE_CONF}"; then
  echo -e "${Y}Remote '${remote}' já existe. Sobrescrevendo.${N}"
  # Apaga o bloco até a próxima seção (ou fim do arquivo)
  awk -v r="${remote}" 'BEGIN{skip=0} /^\[/{skip=($0=="["r"]")?1:0} !skip' "${RCLONE_CONF}" > "${RCLONE_CONF}.tmp"
  mv "${RCLONE_CONF}.tmp" "${RCLONE_CONF}"
fi

cat >> "${RCLONE_CONF}" <<EOF
[${remote}]
type = s3
provider = Cloudflare
access_key_id = ${R2_ACCESS_KEY_ID}
secret_access_key = ${R2_SECRET_ACCESS_KEY}
endpoint = https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com
acl = private
EOF
chmod 600 "${RCLONE_CONF}"
echo -e "${G}✓ Config gravada em ${RCLONE_CONF}${N}"

# Testa conexão
echo -e "\n${C}━━━ Testando conexão ━━━${N}"
if rclone ls "${remote}:${bucket}/" --max-depth 1 >/dev/null 2>&1; then
  echo -e "${G}✓ Conectado e bucket '${bucket}' acessível.${N}"
else
  echo -e "${Y}Bucket '${bucket}' ainda vazio ou inacessível.${N}"
  echo "Tentando criar um arquivo de teste..."
  echo "naori-test-$(date +%s)" | rclone rcat "${remote}:${bucket}/test.txt"
  rclone delete "${remote}:${bucket}/test.txt"
  echo -e "${G}✓ Bucket acessível.${N}"
fi

# Atualiza .env com o nome correto do remote
ENV_FILE="${PROJECT_ROOT}/.env"
if [[ -f "${ENV_FILE}" ]]; then
  if grep -q "^BACKUP_R2_REMOTE=" "${ENV_FILE}"; then
    sed -i.bak "s|^BACKUP_R2_REMOTE=.*|BACKUP_R2_REMOTE=${remote}:${bucket}|" "${ENV_FILE}"
  else
    echo "BACKUP_R2_REMOTE=${remote}:${bucket}" >> "${ENV_FILE}"
  fi
  echo -e "${G}✓ ${ENV_FILE} atualizado com BACKUP_R2_REMOTE=${remote}:${bucket}${N}"
fi

# Agenda cron
echo -e "\n${C}━━━ Agendando backup automático ━━━${N}"
CRON_LINE="30 3 * * * cd ${PROJECT_ROOT} && /usr/bin/env bash ${SCRIPT_DIR}/backup-postgres.sh >> /var/log/naori-backup.log 2>&1"
CURRENT_CRON=$(crontab -l 2>/dev/null || true)

if echo "${CURRENT_CRON}" | grep -qF "${SCRIPT_DIR}/backup-postgres.sh"; then
  echo -e "${Y}Cron já existe. Sobrescrevendo.${N}"
  CURRENT_CRON=$(echo "${CURRENT_CRON}" | grep -vF "${SCRIPT_DIR}/backup-postgres.sh")
fi

printf '%s\n%s\n' "${CURRENT_CRON}" "${CRON_LINE}" | crontab -
echo -e "${G}✓ Agendado para rodar todo dia às 03:30.${N}"

# Pasta de logs
sudo touch /var/log/naori-backup.log 2>/dev/null || true
sudo chown "$(whoami)" /var/log/naori-backup.log 2>/dev/null || true

echo -e "\n${G}━━━ Tudo pronto. ━━━${N}"
echo "Teste o backup AGORA com:"
echo "    cd ${PROJECT_ROOT} && bash deploy/backup-postgres.sh"
