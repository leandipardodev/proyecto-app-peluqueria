const ERROR_MAP: Record<string, string> = {
  "slot_taken": "Este horario ya está ocupado. Elegí otro horario.",
  "SESION_EXPIRADA": "Sesión expirada. Iniciá sesión de nuevo.",
  "SIN_ACCESO_LOCAL": "No tenés acceso a este local.",
  "LOCAL_INVALIDO": "Local inválido.",
  "Turno no encontrado": "No se encontró el turno.",
  "Servicio inválido": "Servicio inválido.",
  "Fecha/hora inválida": "Fecha u hora inválida.",
  "Fecha/hora invalida": "Fecha u hora inválida.",
  "Seleccioná al menos un servicio": "Elegí al menos un servicio.",
  "Uno o más servicios no encontrados": "Algunos servicios no están disponibles.",
  "El profesional no realiza uno o más servicios seleccionados": "El profesional no realiza todos los servicios seleccionados.",
  "No se puede repetir un turno con múltiples servicios": "No podés duplicar un turno con varios servicios.",
  "Duración inválida. Máximo 300 min (5 hs).": "Duración inválida. Máximo 300 minutos (5 hs).",
  "Duración inválida para un servicio. Máximo 300 min (5 hs).": "Duración inválida. Máximo 300 minutos (5 hs).",
  "El precio debe ser un monto válido": "Precio inválido.",
  "La seña debe ser un monto válido": "Seña inválida.",
  "El turno no tiene cliente asignado": "El turno no tiene cliente asignado.",
  "Este turno ya tiene un canje aplicado": "Este turno ya tiene un descuento aplicado.",
  "El cliente no tiene canjes disponibles": "El cliente no tiene descuentos disponibles.",
  "La fidelización está desactivada": "La fidelización está desactivada en este local.",
  "No se encontraron turnos de esta serie": "No se encontraron turnos de esta serie.",
  "Error al mover uno o más turnos": "No se pudieron mover uno o más turnos.",
  "Mercado Pago no está configurado": "Mercado Pago no está configurado para este local.",
  "No se pudo crear la preferencia de pago": "No se pudo iniciar el pago.",
  "La reserva ya no está pendiente": "La reserva ya no está pendiente.",
  "La reserva expiró": "La reserva expiró.",
  "La reserva ya fue procesada": "La reserva ya fue procesada.",
  "El turno ya no está disponible": "Ese turno ya no está disponible.",
};

export function getUserFriendlyError(error: string | null | undefined): string {
  if (!error) return "Ocurrió un error inesperado.";
  return ERROR_MAP[error] || error;
}
