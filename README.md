# Proyecto App Peluquería

Aplicación web para gestión de peluquerías construida con Next.js y Supabase.

## Tecnologías

- **Next.js 16** - Framework React con SSR
- **React 19** - Biblioteca de interfaz de usuario
- **Supabase** - Base de datos PostgreSQL y autenticación
- **Tailwind CSS 4** - Framework de estilos
- **TypeScript** - Tipado estático

## Características

- Gestión de servicios
- Gestión de inventario
- Sistema de citas
- Dashboard administrativo
- Autenticación de usuarios

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

## Variables de entorno

Crea un archivo `.env.local` con:

```
NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

## Despliegue

Optimizado para despliegue en [Vercel](https://vercel.com).

## Versión

0.1.2 - Recuperación de contraseña
