-- Limpieza unica: las notificaciones "aseguradas" tenian su created_at sobreescrito
-- a "ahora" en cada request por un upsert sin ignoreDuplicates. Se borran para que
-- el proximo GET del panel las regenere con un timestamp honesto.

DELETE FROM notifications
WHERE type IN ('recompensa_disponible', 'cliente_cumpleaños', 'plan_por_vencer', 'oportunidad_estacional');
