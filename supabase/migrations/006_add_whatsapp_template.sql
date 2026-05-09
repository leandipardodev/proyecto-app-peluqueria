-- Migration 006: Add whatsapp_template to shops
ALTER TABLE shops ADD COLUMN IF NOT EXISTS whatsapp_template TEXT DEFAULT 'Hola {Nombre}! ✂️ Te recordamos tu turno en {Peluqueria} a las {Hora}. ¡Te esperamos!';
