-- Mercado Pago: configuracion de cobro por preferencia
-- mp_max_installments: cantidad maxima de cuotas ofrecida al cliente (NULL = sin limite / default de MP)
-- mp_excluded_payment_types: tipos de pago excluidos del checkout (ej. 'credit_card')

ALTER TABLE shops ADD COLUMN IF NOT EXISTS mp_max_installments integer;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS mp_excluded_payment_types text[];
