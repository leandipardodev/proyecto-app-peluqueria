# UX Copy Map

Guía rápida para mantener consistencia de microcopy en Klip.

## Términos oficiales

- `turno`: término principal para citas/reservas en la app.
- `historial de turnos`: listado pasado de turnos.
- `próximos turnos`: turnos futuros.
- `correo`: preferido en UI (evitar mezclar con `mail`/`email` en texto visible).
- `enlace`: preferido frente a `link`.
- `personal`: término general para equipo del local.
- `owner`: mantener en contexto de rol técnico cuando ya existe así en sistema.

## Reglas de estilo

- Usar acentos y tildes correctamente (`sesión`, `categorías`, `aún`, `días`).
- Títulos en sentence case (`Próximos turnos`, no `Próximos Turnos`).
- Mensajes de estado breves y accionables.
- Evitar alternar sin motivo entre sinónimos (`turno/cita/reserva`).

## Estados vacíos y error

- Usar `StatePanel` para estados vacíos y errores visuales.
- Patrones recomendados:
  - Vacío: `Sin <recurso>` + explicación corta.
  - Error: `Error al <acción>` + detalle del error cuando corresponda.

## Accesibilidad mínima de copy

- Inputs de búsqueda con `label` visible o `sr-only`.
- Botones icon-only con `aria-label` descriptivo.
- Tablas con `aria-label` cuando no hay caption visible.
- Botones de acción no-submit con `type="button"`.
