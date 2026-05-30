-- Elimina la policy de SELECT anónimo que exponía todos los pending_bookings
-- Motivo: cualquier usuario anónimo podía listar todas las reservas pendientes del sistema
-- Reemplazo: solo los miembros autenticados del local pueden ver sus pending_bookings

drop policy if exists "pending_bookings_select_own" on public.pending_bookings;

create policy "pending_bookings_select_own" on public.pending_bookings
  as permissive for select to anon
  using (false);
