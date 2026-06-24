-- Fase 3: vencimento de plano por organização.
-- `plan_expires_at` é opcional. NULL significa que o plano não tem vencimento
-- automático (ex: contas internas, demos, free trial sem prazo). Quando a
-- coluna tem valor e a data já passou, o backend trata a org como em modo
-- read-only (bloqueio leve), sem afetar logins, super-admin ou clientes finais.
ALTER TABLE "organizations" ADD COLUMN "plan_expires_at" timestamp with time zone;
