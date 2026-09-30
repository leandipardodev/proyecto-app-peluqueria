-- El local puede cobrar en el local (shops.pay_at_shop = true). Cuando eso pasa
-- el cliente arma el pedido SIN pagar online: el turno se confirma al toque y el
-- pedido queda 'pending_payment' para que el local cobre en persona y lo marque
-- pagado desde el panel de pedidos.
--
-- Antes ese caso se guardaba como payment_method = 'mp', asi que un pedido a
-- cobrar en el local se etiquetaba como "Mercado Pago" en orders-panel.tsx. 'cash'
-- lo distingue de un Mercado Pago real que todavia no se pago.
--
-- No cambia el flujo de los webhooks: un pedido 'cash' nunca tiene preference de
-- MP, asi que el webhook no lo toca (ademas sale por el early return de
-- status != 'pending_payment' si alguna vez llegara con metadata).
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('mp', 'bank_transfer', 'cash'));
