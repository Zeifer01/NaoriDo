# Naori — Deploy em VPS (Ubuntu 24.04)

Guia passo a passo para subir o sistema em uma VPS de produção (Contabo / Hostinger / Hetzner / qualquer KVM com Ubuntu 24.04).

> **Arquitetura final:**
> - `https://naorido.com.br` → Frontend Next.js
> - `https://api.naorido.com.br` → Backend Bun + Hono
> - Postgres, Redis e Evolution API rodam **internamente** (não expostos).
> - Caddy faz reverse proxy + SSL automático via Let's Encrypt.
> - Backup diário do Postgres → Cloudflare R2.

---

## Pré-requisitos (antes de comprar a VPS)

- [ ] **Domínio comprado**. Neste guia: `naorido.com.br`.
- [ ] **DNS Cloudflare ativo** para o domínio.
- [ ] **Bucket R2** criado no Cloudflare para uploads (`naori`) e outro para backups (`naori-backups`).
- [ ] **API Token R2** com permissão Read+Write nos buckets.
- [ ] **Chave SSH** local gerada (no Windows, com PowerShell):
  ```powershell
  ssh-keygen -t ed25519 -C "seu-email@example.com"
  # Aceite o caminho padrão. Sem passphrase para começar (ou com, se preferir).
  # Veja sua chave pública para colar no painel da VPS:
  Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
  ```

---

## Etapa 1 — Comprar e provisionar a VPS

### Contabo (recomendado pelo orçamento)
1. Vá em https://contabo.com → **VPS** → **Cloud VPS 10 NVMe**
2. **Region:** USA Central (menor latência para o Brasil)
3. **OS:** Ubuntu 24.04 LTS
4. **SSH Key:** cole a sua chave pública (`id_ed25519.pub`)
5. Pague (cartão internacional, PayPal, ou cripto)

> Contabo pode levar de minutos até **24 horas** para entregar a VPS (anti-fraude manual). Não se assuste.

Quando vier por e-mail o IP e a senha root, anote.

### Hostinger (alternativa BR)
1. **VPS Hosting** → **KVM 2** → São Paulo → Ubuntu 24.04
2. Cole a chave SSH em **Servers** → **SSH Keys** → **Add Key**
3. Instalação automática em ~5min

---

## Etapa 2 — Apontar o DNS para a VPS

No painel do **Cloudflare** → DNS de `naorido.com.br`:

| Tipo | Nome | Conteúdo (IP da VPS) | Proxy |
|------|------|----------------------|-------|
| A | `@`   | `<IP da sua VPS>` | **🔘 DNS only (cinza)** |
| A | `www` | `<IP da sua VPS>` | **🔘 DNS only (cinza)** |
| A | `api` | `<IP da sua VPS>` | **🔘 DNS only (cinza)** |

> **Importante:** comece com **DNS only (nuvem cinza)**. Depois que o Caddy emitir o SSL com sucesso (~2 min), você pode trocar para **proxied (nuvem laranja)** se quiser CDN/DDoS protection. Se já começar com proxied, o Let's Encrypt vai falhar na validação.

Verifique a propagação:
```powershell
nslookup naorido.com.br
nslookup api.naorido.com.br
```
Deve retornar o IP da VPS. Pode levar de **2 minutos a 4 horas**.

---

## Etapa 3 — Conectar na VPS pela primeira vez

```powershell
ssh root@<IP-da-VPS>
```
Se for primeira conexão, vai pedir confirmação da fingerprint — digite `yes`.

> Se pedir senha (não chave), a Contabo provavelmente não usou sua SSH key no provisionamento. Entre com a senha do e-mail e configure a chave manualmente:
> ```bash
> mkdir -p ~/.ssh && chmod 700 ~/.ssh
> nano ~/.ssh/authorized_keys
> # cole sua chave pública (id_ed25519.pub) e salve
> chmod 600 ~/.ssh/authorized_keys
> ```

---

## Etapa 4 — Rodar o bootstrap

Já logado como `root` na VPS:

```bash
# 1) Atualize a lista de pacotes
apt update

# 2) Instale git
apt install -y git

# 3) Clone o repositório
mkdir -p /opt/naori
cd /opt/naori
git clone https://github.com/<seu-user>/<seu-repo>.git .

# Se o repo for privado, use SSH:
#    git clone git@github.com:<seu-user>/<seu-repo>.git .
# (precisa adicionar sua chave SSH no GitHub primeiro)

# 4) Execute o script de bootstrap
bash deploy/setup-vps.sh
```

O script vai levar **5 a 10 minutos**. Ele instala Docker, Caddy, configura firewall, swap, fail2ban, cria usuário `deploy`, etc.

> **Atenção:** ao final do script, o login com **senha** via SSH é **desabilitado**. Você só consegue entrar com chave. **NÃO faça logout** sem antes testar (próximo passo).

---

## Etapa 5 — Testar login como `deploy`

**Em outro terminal**, abra uma nova conexão (não feche a primeira ainda):

```powershell
ssh deploy@<IP-da-VPS>
```

Se entrou tranquilo, **ok**. Pode fechar a sessão de root.

Se **não conseguir entrar**, volte na sessão root e adicione sua chave manualmente em `/home/deploy/.ssh/authorized_keys`.

---

## Etapa 6 — Configurar o `.env` de produção

Já como `deploy`:

```bash
cd /opt/naori
cp deploy/.env.production.example .env
nano .env
```

**Preencha obrigatoriamente:**

```bash
# Gere secrets fortes com:
openssl rand -base64 48
```

Cole os valores em:
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET` (diferente do anterior)
- `WHATSAPP_API_KEY` (também aleatório)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (do Cloudflare)
- `R2_PUBLIC_URL` (URL pública do bucket de uploads)

> O `.env` precisa estar no diretório raiz do projeto (`/opt/naori/.env`), porque o `docker-compose.yml` lê de lá.

---

## Etapa 7 — Configurar o Caddy (reverse proxy + SSL)

```bash
# 1) Edite o Caddyfile para colocar SEU e-mail no topo
nano deploy/Caddyfile
# substitua "seu-email@exemplo.com" pelo seu e-mail real

# 2) Copie para o local oficial
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile

# 3) Cria pasta de logs (Caddy não cria sozinho)
sudo mkdir -p /var/log/caddy
sudo chown caddy:caddy /var/log/caddy

# 4) Valida a sintaxe ANTES de recarregar
sudo caddy validate --config /etc/caddy/Caddyfile

# 5) Recarrega
sudo systemctl reload caddy

# 6) Acompanhe a emissão do SSL (deve levar 30-90 segundos)
sudo journalctl -u caddy -f
```

Quando aparecer "certificate obtained successfully" para `naorido.com.br` e `api.naorido.com.br`, o SSL está pronto. Apertar `Ctrl+C` para sair do `journalctl`.

> **Se falhar:** os erros mais comuns são DNS não propagado ainda (volte na etapa 2) ou Cloudflare com proxy ligado (volte para DNS only).

---

## Etapa 8 — Subir os containers Docker

```bash
cd /opt/naori

# Build + up dos containers (vai demorar 5-10 min na primeira vez)
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build

# Acompanhe os logs
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml logs -f

# Quando estiver tudo "healthy", aperte Ctrl+C
```

Verifique cada container:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml ps
```

Você deve ver: `postgres`, `redis`, `evolution-api`, `api`, `web` — todos em `Up (healthy)`.

---

## Etapa 9 — Criar usuário super-admin

A migration de banco roda automaticamente (container `migrate`). Mas você ainda não tem nenhum usuário.

Tem duas opções:

### Opção A — Importar dados existentes
Se você tinha rodado o seed/import localmente e quer levar isso pra produção:

```bash
# Localmente, exporte:
docker compose exec postgres pg_dump -U restai restai | gzip > naori-local.sql.gz
# Envie pra VPS:
scp naori-local.sql.gz deploy@<IP>:/tmp/

# Na VPS, importe:
gunzip < /tmp/naori-local.sql.gz | docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml exec -T postgres psql -U naori -d restai
```

### Opção B — Começar do zero
```bash
cd /opt/naori

# Roda o seed (cria org Naori Do + admin)
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml exec api bun run /app/packages/db/src/seed.ts

# Promove para super_admin
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml exec api bun run /app/packages/db/src/promote-super-admin.ts admin@restai.pe
```

---

## Etapa 10 — Testar

Abra no navegador:
- https://naorido.com.br → painel de login
- https://api.naorido.com.br/health → deve retornar `{ "status": "ok" }`

Faça login com as credenciais que você usou no seed (`admin@restai.pe` / `admin12345`).

**Troque a senha imediatamente** em Configurações → Conta.

---

## Etapa 11 — Configurar backup automático

```bash
cd /opt/naori
bash deploy/setup-backup.sh
```

O script vai pedir suas credenciais R2 (você já tem do `.env`), configura o rclone, testa a conexão e agenda no cron pra rodar todo dia às 03:30.

Para testar AGORA:
```bash
bash deploy/backup-postgres.sh
# Verifique se o arquivo apareceu no bucket:
rclone ls r2:naori-backups/
```

---

## Etapa 12 — (Opcional) Ligar o Cloudflare como proxy

Agora que o SSL Let's Encrypt está emitido, você pode ligar o proxy do Cloudflare:

1. No Cloudflare → DNS → mude as 3 entradas (`@`, `www`, `api`) para **🟧 Proxied**
2. Em SSL/TLS → defina o modo como **"Full (strict)"**
3. Em Speed → Optimization → habilite **Brotli**, **Auto Minify**, **Early Hints**

Pronto, agora você ganha cache de CDN + proteção DDoS sem custo.

---

## Comandos do dia a dia

```bash
# Ver status dos containers
cd /opt/naori
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml ps

# Ver logs
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml logs -f api
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml logs -f web

# Atualizar para a versão mais recente do código
git pull
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build

# Restart de um container só
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml restart api

# Ver uso de recursos
docker stats --no-stream

# Acessar o Postgres no terminal
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml exec postgres \
  psql -U naori -d restai

# Backup manual
bash deploy/backup-postgres.sh

# Restaurar de backup
gunzip < /var/backups/naori/naori-YYYYMMDD-HHMMSS.sql.gz | \
  docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml exec -T postgres \
  psql -U naori -d restai
```

> **Dica:** crie um alias no `~/.bashrc` para encurtar:
> ```bash
> echo 'alias dc="docker compose -f /opt/naori/docker-compose.yml -f /opt/naori/deploy/docker-compose.prod.yml"' >> ~/.bashrc
> source ~/.bashrc
> # agora você pode usar: dc ps, dc logs -f api, etc.
> ```

---

## Resolução de problemas

### Caddy fica reiniciando ou não pega SSL
```bash
sudo journalctl -u caddy -n 100
```
Causas comuns:
- DNS ainda não propagou (espere mais)
- Cloudflare está em "Proxied" — volte para "DNS only"
- Porta 80/443 bloqueada (verifique `sudo ufw status`)

### Container `api` reinicia em loop
```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml logs --tail=100 api
```
Normalmente é variável de ambiente faltando no `.env`. Confira `JWT_SECRET`, `DATABASE_URL`, etc.

### "Out of memory" ao buildar
A VPS de 4 GB às vezes não dá conta de buildar o Next.js + Postgres rodando ao mesmo tempo.
```bash
# Pare os containers, builde, suba de novo
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml down
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml build
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d
```

### `docker compose` não reconhece `!override`
Você está em uma versão antiga do Compose. Atualize:
```bash
sudo apt update && sudo apt install --only-upgrade docker-compose-plugin
docker compose version  # precisa ser 2.24+
```

### Esqueci a senha SSH e não consigo entrar
Use o **console web** do painel da Contabo/Hostinger (acesso direto ao terminal da VM). Lá você pode resetar:
```bash
# Re-habilitar login com senha temporariamente:
sudo sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config.d/99-naori-hardening.conf
sudo systemctl reload ssh
sudo passwd deploy
# Entre via SSH com senha, conserte a chave, depois desabilite senha de novo.
```

---

## Custos mensais estimados

| Item | Custo |
|------|-------|
| Contabo VPS 10 NVMe | ~R$ 38 (US$ 6.60) |
| Domínio `.com.br` (Registro.br) | ~R$ 40/ano = R$ 3,30/mês |
| Cloudflare DNS + Proxy | R$ 0 |
| Cloudflare R2 (uploads + backups, < 10 GB) | R$ 0 |
| Let's Encrypt SSL | R$ 0 |
| **TOTAL** | **~R$ 42/mês** |
