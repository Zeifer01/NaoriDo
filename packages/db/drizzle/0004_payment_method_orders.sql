-- Forma de pagamento preferida pelo cliente ao criar pedido delivery/retirada.
-- Campo opcional: pedidos criados pelo POS ou mesas não têm este campo.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_method" varchar(20);
