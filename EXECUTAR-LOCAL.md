# Executar o Naori (RestAI) localmente — Windows / PowerShell

Guia rápido para subir o projeto na sua máquina.

## Pré-requisitos

Instale antes de começar:

1. **[Bun](https://bun.sh)** — runtime e gerenciador de pacotes
2. **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** — PostgreSQL e Redis
3. **Git** (opcional, se for clonar o repositório)

Verifique no PowerShell:

```powershell
bun --version
docker --version
docker compose version
```

---

## 1. Entrar na pasta do projeto

```powershell
cd "C:\Users\ivans\OneDrive\Área de Trabalho\Projetos\Naori"
```

> Ajuste o caminho se o projeto estiver em outro lugar.

---

## 2. Configurar variáveis de ambiente (primeira vez)

Se ainda não existirem os arquivos `.env`:

```powershell
Copy-Item .env.example .env
Copy-Item .env.example apps\api\.env
Copy-Item .env.example packages\db\.env
```

Edite **`apps\api\.env`** e **`packages\db\.env`** com estes valores para rodar **fora** do Docker:

```env
POSTGRES_USER=restai
POSTGRES_PASSWORD=change-me-in-production

DATABASE_URL=postgresql://restai:change-me-in-production@localhost:5433/restai
REDIS_URL=redis://localhost:6380

API_PORT=3001
CORS_ORIGINS=http://localhost:3000

NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_URL=http://localhost:3000
```

O arquivo **`.env` na raiz** é usado pelo Docker Compose (mesma senha do Postgres).

---

## 3. Instalar dependências (primeira vez)

```powershell
bun install
```

---

## 4. Subir banco de dados e Redis (Docker)

```powershell
docker compose up -d postgres redis
```

Aguarde alguns segundos e confira se estão rodando:

```powershell
docker compose ps
```

Portas usadas:

| Serviço    | Porta local |
|-----------|-------------|
| PostgreSQL | **5433**   |
| Redis      | **6380**   |

---

## 5. Criar tabelas e dados de exemplo (primeira vez)

```powershell
bun run db:migrate
bun run db:seed
```

---

## 6. Iniciar o aplicativo

```powershell
bun run dev
```

Isso sobe:

| App              | URL                          |
|------------------|------------------------------|
| Painel (Web)     | http://localhost:3000        |
| API              | http://localhost:3001        |

**Login de demonstração** (após o seed):

- E-mail: `admin@restai.pe`
- Senha: `admin12345`

Para parar: `Ctrl + C` no terminal.

---

## 7. WhatsApp (opcional)

Só necessário se for usar notificações por WhatsApp:

```powershell
docker compose up -d evolution-api
```

No `apps\api\.env`:

```env
WHATSAPP_ENABLED=true
WHATSAPP_API_URL=http://localhost:8085
WHATSAPP_API_KEY=restai-evolution-dev-key
WHATSAPP_INSTANCE=restai
EVOLUTION_SERVER_URL=http://localhost:8085
```

Reinicie a API (`bun run dev`) e conecte em **Configurações → WhatsApp**.

Evolution Manager: http://localhost:8085/manager

---

## Comandos úteis no dia a dia

```powershell
# Subir tudo (web + API)
bun run dev

# Só infra (Postgres + Redis)
docker compose up -d postgres redis

# Parar containers Docker
docker compose down

# Ver logs do Docker
docker compose logs -f

# Resetar banco e popular de novo (cuidado: apaga dados)
bun run db:migrate
bun run db:seed
```

---

## Problemas comuns

### Porta 3000 ou 3001 já em uso

```powershell
netstat -ano | findstr ":3001"
netstat -ano | findstr ":3000"
```

Encerre o processo antigo ou pare outro `bun run dev` que esteja aberto.

### Docker não inicia / erro de conexão com banco

1. Abra o **Docker Desktop** e espere ficar “Running”.
2. Rode de novo: `docker compose up -d postgres redis`
3. Confira se `DATABASE_URL` usa a porta **5433**.

### API desatualizada (rota não encontrada)

Pare o servidor (`Ctrl + C`) e execute novamente:

```powershell
bun run dev
```

---

## Cardápio delivery (link público local)

Com a filial rodando e produtos cadastrados:

```
http://localhost:3000/delivery/{slug-da-filial}/menu
```

O slug aparece em **Configurações → Filial** ou no link gerado em **Cardápio**.
