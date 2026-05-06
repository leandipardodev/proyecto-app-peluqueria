# TODO - App de Peluquería (Klip)

## ✅ Completado

### Configuración inicial
- [x] Configurar Warp notifications (`~/.config/opencode/config.json`)
- [x] Instalar plugin `@warp-dot-dev/opencode-warp`
- [x] Unificar esquema DB en inglés (shops, user_profiles, services, appointments, stock, leads_global)
- [x] Conectar con Supabase (proyecto `ildsxnhangxuytyerukh`)
- [x] Push de migración inicial `001_initial_schema.sql`

### Páginas y componentes
- [x] Crear página Turnos (`/dashboard/appointments`)
- [x] Crear página Configuración (`/dashboard/settings`)
- [x] Eliminar `src/lib/supabase.ts` innecesario
- [x] Crear componentes UI: `button.tsx`, `input.tsx`, `label.tsx`
- [x] Crear `src/lib/utils.ts` con función `cn`

### Corrección de errores
- [x] Instalar dependencias faltantes: `clsx`, `tailwind-merge`, `@radix-ui/react-slot`, `@radix-ui/react-label`
- [x] Fix TypeScript errors en `auth/login/route.ts` (cookie types)
- [x] Fix TypeScript errors en `appointments/page.tsx` (missing props)
- [x] Fix TypeScript errors en `appointment-form-modal.tsx` (onSuccess)
- [x] Fix TypeScript errors en `server.ts` (cookie types)
- [x] Fix TypeScript errors en `auth-actions.ts` (missing imports)
- [x] Fix TypeScript errors en `settings/page.tsx` (useEffect instead of useState)

## 🔄 En progreso

- [ ] **Test de la app completa**
  - Registrar nueva peluquería
  - Login con credenciales
  - CRUD servicios
  - CRUD inventario
  - CRUD turnos (calendario)
  - Verificar carga de datos en cada página

## ⏳ Pendiente

### Testing y validación
- [ ] Probar flujo completo de registro
- [ ] Probar login/logout
- [ ] Verificar datos en Supabase dashboard
- [ ] Probar creación de turnos con el modal
- [ ] Probar creación de nuevos clientes desde el modal de turnos

### Documentación
- [ ] Crear `README.md` del proyecto
- [ ] Documentar variables de entorno necesarias
- [ ] Actualizar `AGENTS.md` con comandos de lint/typecheck

### Mejoras opcionales
- [ ] Agregar validaciones de formularios
- [ ] Mejorar manejo de errores
- [ ] Agregar tests unitarios
- [ ] Configurar CI/CD

## 📝 Notas importantes

- **Supabase project ref**: `ildsxnhangxuytyerukh`
- **Supabase URL**: `https://ildsxnhangxuytyerukh.supabase.co`
- **Dev server**: `http://localhost:3000`
- **Esquema DB**: En inglés (shops, user_profiles, services, appointments, etc.)
- **Commits**: Un commit por cambio, mensajes descriptivos en español
