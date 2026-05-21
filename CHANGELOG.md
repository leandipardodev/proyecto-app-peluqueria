# Changelog

## [1.0.1] - 2026-05-21

### Personalizacion avanzada de /book
- Nuevo sistema de templates para /book con configuracion por local
- Se agregaron 4 estilos visuales premium con vista previa en vivo
- Se eliminaron texturas de ruido y se rediseñaron fondos, tipografia, cards y progreso
- Se incorporo feedback tactil (haptic) en categorias, servicios y confirmacion
- Se corrigio la inicializacion del checkout para evitar errores por preferenceId invalido

### Mi Negocio y experiencia de edicion
- Nueva seccion de personalizacion de /book dentro de Mi Negocio
- Carrusel de skins mejorado con arrastre manual e inercia suave tipo app nativa
- Rework mobile de secciones/categorias con flujo de arrastrar/soltar y quitar por categoria
- Vista previa mobile/desktop alineada con los estilos reales de /book

### UX global de dashboard
- Mejoras en headers, sidebar, transiciones y estados de carga glass
- Nuevos componentes de soporte visual y modal de reporte de bugs

### Base de datos y assets
- Nuevas migraciones para guardar tema, assets y orden de secciones/servicios de /book
- Nuevos previews SVG y recursos graficos para templates

### App shell
- Favicon actualizado a nuevo icono PNG

## [0.1.4] - 2026-05-06

### Sección de Personal (Staff)
- Nueva sección `/dashboard/staff` para gestionar peluqueros
- Lista de personal con roles (Peluquero/Administrador)
- Formulario para agregar nuevos peluqueros por email
- Estimativo de facturación por peluquero
- Cálculo automático basado en turnos completados y pagados
- Cambio de rol y eliminación de personal
- Enlace agregado en el sidebar del dashboard

## [0.1.3] - 2026-05-06

### Correcciones y Mejoras de Calendario
- Corregido sistema de autenticación (sesión estable en todo el dashboard)
- Reemplazado @supabase/supabase-js por clientes correctos en 8 archivos
- Calendario ajustado: horario de 7:00 AM a 00:00 (medianoche)
- Altura de filas reducida a 48px para mejor visualización
- Implementado scroll horizontal con Ctrl+Click en PC
- Agregado scroll vertical automático para calendario más alto
- Eliminado indicador visual de navegación

## [0.1.2] - 2026-05-06

### Recuperación de Contraseña
- Agregado botón "¿Olvidaste tu contraseña?" en login
- Formulario de recuperación con envío de email
- Integración con Supabase Auth resetPasswordForEmail
- Mensaje de confirmación de email enviado
- Navegación fluida entre login y recuperación

## [0.1.1] - 2026-05-06

### Landing Page
- Nueva página de inicio con navegación clara
- Acceso directo a Login y Registro desde la home
- Diseño profesional con gradiente y cards de características
- Botones de acción prominentes para conversión
- Responsive design para móviles y desktop

## [0.1.0] - 2026-05-06

### Inicial
- Estructura base del proyecto con Next.js 16
- Integración con Supabase (Auth, Base de datos)
- Sistema de gestión de servicios
- Gestión de inventario
- Dashboard administrativo
- Sistema de autenticación de usuarios
- Interfaz con Tailwind CSS 4
