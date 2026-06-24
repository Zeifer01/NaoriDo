#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Naori — Bootstrap de VPS Ubuntu 24.04 (Contabo / Hostinger / qualquer KVM)
# ─────────────────────────────────────────────────────────────────────────────
#  O QUE ESTE SCRIPT FAZ (idempotente — pode rodar várias vezes):
#    1. Atualiza pacotes do sistema
#    2. Configura timezone (America/Sao_Paulo) e locale pt_BR
#    3. Cria 4 GB de swap (mitiga oscilação de RAM no Contabo)
#    4. Otimiza sysctl para Docker + Postgres
#    5. Habilita firewall ufw (SSH/22, HTTP/80, HTTPS/443)
#    6. Instala e configura fail2ban (anti-bruteforce no SSH)
#    7. Habilita atualizações de segurança automáticas
#    8. Endurece o SSH (sem login com senha, sem root login direto)
#    9. Instala Docker Engine + Compose plugin
#   10. Instala Caddy (reverse proxy com SSL Let's Encrypt automático)
#   11. Instala rclone (para backup do Postgres no Cloudflare R2)
#   12. Cria usuário "deploy" com sudo, no grupo docker
#   13. Resume tudo e mostra os próximos passos
#
#  USO (como root, na primeira vez):
#      curl -fsSL https://raw.githubusercontent.com/.../setup-vps.sh -o setup-vps.sh
#      sudo bash setup-vps.sh
#  ou simplesmente, depois do git clone do projeto:
#      cd /opt/naori && sudo bash deploy/setup-vps.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuração (ajuste se quiser) ─────────────────────────────────────────
DEPLOY_USER="${DEPLOY_USER:-deploy}"
TIMEZONE="${TIMEZONE:-America/Sao_Paulo}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-4}"
SSH_PORT="${SSH_PORT:-22}"
APP_DIR="${APP_DIR:-/opt/naori}"
# ────────────────────────────────────────────────────────────────────────────

# Cores p/ output
B="\033[1m"; G="\033[1;32m"; Y="\033[1;33m"; R="\033[1;31m"; C="\033[1;36m"; N="\033[0m"

log()  { echo -e "${C}==> ${1}${N}"; }
ok()   { echo -e "${G}  ✓ ${1}${N}"; }
warn() { echo -e "${Y}  ! ${1}${N}"; }
err()  { echo -e "${R}  ✗ ${1}${N}" >&2; }
title(){ echo -e "\n${B}━━━ ${1} ━━━${N}"; }

# ── 0. Pré-checks ───────────────────────────────────────────────────────────
title "0. Pré-checks"

if [[ $EUID -ne 0 ]]; then
  err "Este script precisa ser executado como root. Use: sudo bash $0"
  exit 1
fi

if ! command -v lsb_release &>/dev/null; then
  apt-get update -qq && apt-get install -y -qq lsb-release
fi

OS_ID=$(lsb_release -is)
OS_VER=$(lsb_release -rs)
if [[ "${OS_ID}" != "Ubuntu" ]] || [[ ! "${OS_VER}" =~ ^(20\.04|22\.04|24\.04)$ ]]; then
  warn "Detectado ${OS_ID} ${OS_VER}. Script é testado em Ubuntu 20.04/22.04/24.04."
  warn "Pode funcionar, mas sem garantia. Continuando em 5s..."
  sleep 5
else
  ok "Ubuntu ${OS_VER} detectado."
fi

export DEBIAN_FRONTEND=noninteractive

# ── 1. Atualização do sistema ───────────────────────────────────────────────
title "1. Atualizando pacotes do sistema"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git ca-certificates gnupg lsb-release \
  htop ncdu jq unzip vim less \
  apt-transport-https software-properties-common \
  postgresql-client
ok "Pacotes base instalados."

# ── 2. Timezone + locale ────────────────────────────────────────────────────
title "2. Configurando timezone e locale"
timedatectl set-timezone "${TIMEZONE}"
ok "Timezone: ${TIMEZONE}"

if ! locale -a 2>/dev/null | grep -qi 'pt_BR\.utf8'; then
  apt-get install -y -qq locales
  locale-gen pt_BR.UTF-8 en_US.UTF-8 >/dev/null
  update-locale LANG=pt_BR.UTF-8 LC_ALL=pt_BR.UTF-8
  ok "Locale pt_BR.UTF-8 gerado."
else
  ok "Locale pt_BR.UTF-8 já presente."
fi

# ── 3. Swap ─────────────────────────────────────────────────────────────────
title "3. Configurando swap de ${SWAP_SIZE_GB}GB"
SWAP_FILE="/swapfile"
if [[ -f "${SWAP_FILE}" ]] && swapon --show | grep -q "${SWAP_FILE}"; then
  ok "Swap já configurado em ${SWAP_FILE}."
else
  log "Alocando ${SWAP_SIZE_GB}GB em ${SWAP_FILE}..."
  fallocate -l "${SWAP_SIZE_GB}G" "${SWAP_FILE}" || dd if=/dev/zero of="${SWAP_FILE}" bs=1M count=$((SWAP_SIZE_GB*1024)) status=progress
  chmod 600 "${SWAP_FILE}"
  mkswap "${SWAP_FILE}" >/dev/null
  swapon "${SWAP_FILE}"
  if ! grep -q "${SWAP_FILE}" /etc/fstab; then
    echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
  fi
  ok "Swap ativo."
fi

# Reduz uso de swap (só usa em pressão real de memória)
echo 'vm.swappiness=10' > /etc/sysctl.d/99-naori-swappiness.conf

# ── 4. sysctl (Docker + Postgres friendly) ──────────────────────────────────
title "4. Otimizando parâmetros do kernel"
cat > /etc/sysctl.d/99-naori-tuning.conf <<'EOF'
# Limites de conexão e backlog
net.core.somaxconn = 4096
net.core.netdev_max_backlog = 16384
net.ipv4.tcp_max_syn_backlog = 8192

# Reaproveita conexões TCP em TIME_WAIT (útil pra API com muitas requisições curtas)
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15

# Memória virtual e dirty pages (postgres-friendly)
vm.overcommit_memory = 1
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5

# inotify (Next.js dev mode usa bastante)
fs.inotify.max_user_watches = 524288
fs.inotify.max_user_instances = 512
EOF
sysctl --system >/dev/null
ok "sysctl aplicado."

# ── 5. Firewall ufw ─────────────────────────────────────────────────────────
title "5. Configurando firewall (ufw)"
apt-get install -y -qq ufw
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}/tcp" comment 'SSH'
ufw allow 80/tcp  comment 'HTTP (Caddy)'
ufw allow 443/tcp comment 'HTTPS (Caddy)'
ufw --force enable >/dev/null
ok "Firewall ativo: 22, 80, 443 abertos."

# ── 6. fail2ban (anti-bruteforce SSH) ───────────────────────────────────────
title "6. Instalando fail2ban"
apt-get install -y -qq fail2ban
cat > /etc/fail2ban/jail.d/naori-sshd.conf <<EOF
[sshd]
enabled  = true
port     = ${SSH_PORT}
maxretry = 5
bantime  = 1h
findtime = 10m
EOF
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban
ok "fail2ban ativo (banimento após 5 tentativas em 10min)."

# ── 7. unattended-upgrades ──────────────────────────────────────────────────
title "7. Habilitando atualizações de segurança automáticas"
apt-get install -y -qq unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
cat > /etc/apt/apt.conf.d/50unattended-upgrades-naori <<'EOF'
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
ok "Atualizações de segurança automáticas habilitadas."

# ── 8. Hardening SSH ────────────────────────────────────────────────────────
title "8. Endurecendo configuração do SSH"
# Ubuntu 20.04 pode não ter o Include no sshd_config principal
if ! grep -qE "^Include\s+/etc/ssh/sshd_config\.d" /etc/ssh/sshd_config; then
  sed -i '1s/^/Include \/etc\/ssh\/sshd_config.d\/*.conf\n/' /etc/ssh/sshd_config
  ok "Include sshd_config.d adicionado ao sshd_config principal."
fi
mkdir -p /etc/ssh/sshd_config.d
SSHD_CONF="/etc/ssh/sshd_config.d/99-naori-hardening.conf"
cat > "${SSHD_CONF}" <<EOF
# Naori VPS hardening
Port ${SSH_PORT}
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
AllowAgentForwarding no
X11Forwarding no
PrintMotd no
EOF
warn "Login com SENHA via SSH foi DESABILITADO. Login só com chave SSH a partir de agora."
warn "Root só consegue logar com chave (não com senha)."
systemctl reload ssh || systemctl reload sshd
ok "SSH endurecido."

# ── 9. Docker ───────────────────────────────────────────────────────────────
title "9. Instalando Docker Engine e Compose plugin"
if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  ok "Docker instalado: $(docker --version)"
else
  ok "Docker já presente: $(docker --version)"
fi

# Limpa logs de container (evita encher o disco)
mkdir -p /etc/docker
if [[ ! -f /etc/docker/daemon.json ]] || ! grep -q "max-size" /etc/docker/daemon.json 2>/dev/null; then
  cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
EOF
  systemctl restart docker
  ok "Docker daemon configurado com rotação de logs."
fi

# ── 10. Caddy (reverse proxy + SSL automático) ──────────────────────────────
title "10. Instalando Caddy (reverse proxy)"
if ! command -v caddy &>/dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
  ok "Caddy instalado: $(caddy version)"
else
  ok "Caddy já presente: $(caddy version)"
fi

# ── 11. rclone (para backup R2) ─────────────────────────────────────────────
title "11. Instalando rclone"
if ! command -v rclone &>/dev/null; then
  curl -fsSL https://rclone.org/install.sh | bash >/dev/null
  ok "rclone instalado: $(rclone version | head -n1)"
else
  ok "rclone já presente: $(rclone version | head -n1)"
fi

# ── 12. Usuário deploy ──────────────────────────────────────────────────────
title "12. Criando usuário '${DEPLOY_USER}'"
if id "${DEPLOY_USER}" &>/dev/null; then
  ok "Usuário '${DEPLOY_USER}' já existe."
else
  useradd -m -s /bin/bash -G sudo,docker "${DEPLOY_USER}"
  # Deploy entra direto sem senha de sudo (pode mudar depois)
  echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/90-${DEPLOY_USER}
  chmod 0440 /etc/sudoers.d/90-${DEPLOY_USER}
  ok "Usuário criado e adicionado a sudo,docker."
fi

# Copia authorized_keys do root pro deploy (assim você consegue logar como deploy)
ROOT_KEYS="/root/.ssh/authorized_keys"
DEPLOY_SSH="/home/${DEPLOY_USER}/.ssh"
DEPLOY_KEYS="${DEPLOY_SSH}/authorized_keys"
if [[ -f "${ROOT_KEYS}" ]]; then
  install -d -m 0700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${DEPLOY_SSH}"
  cp -f "${ROOT_KEYS}" "${DEPLOY_KEYS}"
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_KEYS}"
  chmod 0600 "${DEPLOY_KEYS}"
  ok "Chave SSH do root copiada para ${DEPLOY_USER}."
else
  warn "Nenhuma chave SSH encontrada em ${ROOT_KEYS}."
  warn "Adicione manualmente: nano /home/${DEPLOY_USER}/.ssh/authorized_keys"
fi

# ── 13. Diretório da aplicação ──────────────────────────────────────────────
title "13. Preparando diretório da aplicação em ${APP_DIR}"
mkdir -p "${APP_DIR}"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}"
ok "Diretório pronto."

# ── 14. Resumo ──────────────────────────────────────────────────────────────
title "Resumo"

# Pega IP público
PUBLIC_IP=$(curl -fsSL --max-time 5 https://api.ipify.org 2>/dev/null || echo "<não detectado>")

cat <<EOF

${G}${B}✓ Bootstrap concluído com sucesso!${N}

  Sistema:        $(uname -srm)
  Hostname:       $(hostname)
  IP público:     ${PUBLIC_IP}
  Timezone:       $(timedatectl show --property=Timezone --value)
  Memória total:  $(free -h | awk '/^Mem:/ {print $2}')
  Swap total:     $(free -h | awk '/^Swap:/ {print $2}')
  Disco livre:    $(df -h / | awk 'NR==2 {print $4}') livres em /

${B}Software instalado:${N}
  Docker:         $(docker --version 2>/dev/null || echo '?')
  Compose:        $(docker compose version --short 2>/dev/null || echo '?')
  Caddy:          $(caddy version 2>/dev/null | head -1 || echo '?')
  rclone:         $(rclone version 2>/dev/null | head -1 || echo '?')
  fail2ban:       $(systemctl is-active fail2ban)
  ufw:            $(ufw status | head -1)

${B}Próximos passos (execute como ${DEPLOY_USER}, NÃO como root):${N}

  ${C}# Saia e entre de novo como o usuário deploy:${N}
  exit
  ssh ${DEPLOY_USER}@${PUBLIC_IP}

  ${C}# Clone o projeto:${N}
  cd ${APP_DIR}
  git clone https://github.com/Zeifer01/NaoriDo.git .

  ${C}# Configure o .env de produção:${N}
  cp deploy/.env.production.example .env
  nano .env       # preencha senhas, JWT secrets, R2 keys

  ${C}# Configure o Caddy:${N}
  sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
  sudo systemctl reload caddy

  ${C}# Suba os containers:${N}
  docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d

  ${C}# (Opcional) Configure backup automático para R2:${N}
  bash deploy/setup-backup.sh

${Y}!! Importante:${N}
  - SSH com SENHA foi DESABILITADO. Login só funciona com chave SSH.
  - Antes de fazer logout, abra OUTRO terminal e teste:
        ssh ${DEPLOY_USER}@${PUBLIC_IP}
  - Se NÃO conseguir entrar como ${DEPLOY_USER}, fix com:
        sudo nano /home/${DEPLOY_USER}/.ssh/authorized_keys
        sudo chown ${DEPLOY_USER}:${DEPLOY_USER} /home/${DEPLOY_USER}/.ssh/authorized_keys
        sudo chmod 600 /home/${DEPLOY_USER}/.ssh/authorized_keys

EOF
