# CONTEXT-DESIGN.md — Reglas de Diseño Klip

## Paleta

### CSS Variables
Light: `--ui-bg: #f5f7fb`, `--ui-surface: #ffffff`, `--ui-border: #dbe2ea`, `--ui-text: #0f172a`, `--ui-primary: #0a84ff`
Dark: `--ui-bg: #0a0a0c`, `--ui-surface: #131316`, `--ui-border: #252528`, `--ui-text: #e5e7eb`, `--ui-primary: #4ea2ff`

### Semántico
- Éxito/ingreso: `emerald-500/600/700`
- Error/gasto: `red-500/600`, `rose-500/700`
- Warning: `amber-500/600/700`
- Info: `blue-500/600`
- Neutro chrome: `zinc-200/700/800/900`, `slate-200/500/700`

## Tipografía

- **Font**: Inter, system fallbacks. Anti-aliased.
- **h1 page**: `text-3xl sm:text-5xl font-bold tracking-tight leading-none text-gray-900 dark:text-white`
- **h2 section**: `text-lg font-semibold tracking-tight text-gray-900 dark:text-white`
- **h3 sub**: `text-sm font-semibold text-gray-900 dark:text-white`
- **Body**: `text-sm text-gray-900 dark:text-gray-100`
- **Secondary**: `text-sm text-gray-700 dark:text-gray-300`
- **Caption**: `text-xs text-zinc-500 dark:text-zinc-400`
- **Tiny label**: `text-[11px] text-zinc-500 dark:text-zinc-400`
- **Stat label**: `text-[11px] uppercase tracking-wide text-slate-500 dark:text-zinc-400`
- **Table header**: `text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`

## Border Radius

| Uso | Clase |
|---|---|
| Inputs, pills, badges | `rounded-full` |
| Buttons | `rounded-lg` o `rounded-xl` |
| Cards internos | `rounded-2xl` |
| Sección/accordion | `rounded-[2rem]` |
| Tablas/finance | `rounded-3xl` |
| Booking shell | `rounded-[32px]` |

## Borders

- **Estándar**: `border-zinc-200 dark:border-zinc-800`
- **Inputs**: `border-zinc-200 dark:border-zinc-700`
- **Subtle**: `border-white/20 dark:border-white/10`
- **Dashed (add new)**: `border-dashed border-zinc-300 dark:border-zinc-700`

## Shadows

- **Cards**: `shadow-sm`
- **Hover cards**: `shadow-md hover:shadow-md`
- **Modals**: `shadow-xl`
- **Floating**: `shadow-lg`
- **Decorative**: `shadow-[0_8px_30px_rgb(0,0,0,0.03)]`

## Inputs

**Estándar (rounded-full)**:
```
w-full rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all
```

**Compacto (rounded-lg)**:
```
w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500/30 transition-all disabled:opacity-50
```

**Label estándar**: `block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer`
**Label compacto**: `block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1`
**Error**: `border-red-400 focus:ring-red-400/50`

## Buttons

**UI CSS classes** (definidas en globals.css):
- `.ui-btn-primary` — bg primary, white text, rounded-lg, hover darken
- `.ui-btn-ghost` — bg surface, border subtle, text primary
- `.ui-badge` — pill bg primary/14%, text primary

**Tamaños típicos**:
- `rounded-lg px-4 py-2 text-sm font-medium` (estándar)
- `rounded-xl px-5 py-2.5 text-sm` (grande)
- `rounded-full px-3 py-1.5 text-xs font-semibold` (pill)

**Danger**: `bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-semibold`
**Danger inline**: `text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-full px-3 py-1.5 text-xs`
**Solid dark (MP connect)**: `bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl px-4 py-2.5 text-sm font-medium`

## Cards / Containers

**Accordion section**:
```
rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900
```

**Card interno / sub-card**:
```
rounded-2xl border border-white/20 dark:border-white/10 bg-white dark:bg-zinc-900 p-5
```

**Quick link card**:
```
rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200
```

**Stat card (glass)**:
```
glass-sheen-card rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-4 flex flex-col
```

**Empty state / dashed**:
```
rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 min-h-[120px] flex items-center justify-center
```

**Danger zone**:
```
rounded-[2rem] border border-red-200/70 dark:border-red-600/30 bg-red-50/70 dark:bg-red-950/20 p-6
```

## Section Headers (Accordion)

**Trigger**: `w-full px-6 py-5 flex items-center gap-3 text-left`
**Icon container**: `p-2 rounded-full bg-{color}-500/15` (violet, amber, blue, emerald)
**Icon**: `w-5 h-5 text-{color}-600`
**Heading**: `text-lg font-semibold tracking-tight text-gray-900 dark:text-white`
**Subtext**: `text-xs text-zinc-400 dark:text-zinc-500`
**Chevron**: `w-5 h-5 text-zinc-400 transition-transform duration-300 rotate-180`
**Body animation**: `motion.div` height:0→auto, opacity:0→1, duration:0.3, ease:easeInOut
**Body padding**: `p-6 space-y-5`

## Badges / Status

**Base**: `px-2 inline-flex items-center whitespace-nowrap text-xs leading-5 font-semibold rounded-full`
- scheduled: `bg-amber-50 text-amber-700`
- confirmed/completed: `bg-emerald-50 text-emerald-700`
- cancelled/no_show: `bg-rose-50 text-rose-700`
- paid: `bg-sky-50 text-sky-700`

**Cash open**: `rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`
**Cash closed**: `bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400`

## Modals / Sheets

**Backdrop**: `fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-3 sm:p-4`
**Container**: `bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl max-w-md max-h-[88dvh] flex flex-col`
**Header**: `flex items-center justify-between px-5 py-4 shrink-0 border-b border-zinc-200 dark:border-zinc-800`
**Close**: `p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800`
**Spring**: `{ type: "spring", stiffness: 460, damping: 34, mass: 0.65 }`
**Animation**: initial `{ opacity: 0, y: 24, scale: 0.97 }` → animate `{ opacity: 1, y: 0, scale: 1 }`

**Sheet (side panel)**:
- Panel: `fixed right-0 top-0 h-[100dvh] max-w-xl bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 flex flex-col`
- Animation: `x: "100%" → 0`, spring `{ stiffness: 400, damping: 36 }`

## Toasts

**Container**: `fixed bottom-4 right-4 z-[100] flex flex-col-reverse max-w-sm`
**Item**: `flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg animate-slide-up`
- success: `bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800`
- error: `bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800`
- info: `bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800`

## Inline Messages

**Error banner**: `bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm px-5 py-3 rounded-full border border-red-200/30 dark:border-red-500/20`
**Success**: `bg-green-50 dark:bg-green-950 text-green-700 border-green-200/30 rounded-full`
**Warning**: `rounded-2xl border border-amber-200/60 bg-amber-50/70 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-800 dark:text-amber-200`

## Spacing

- **Page wrapper**: `space-y-6` (general), `space-y-5` (finances), `space-y-6 pb-20` (con FAB)
- **Accordion body**: `p-6 space-y-5`
- **Grid gaps**: `gap-2` (tight), `gap-3` (moderate), `gap-4` (standard)
- **Label margin**: `mb-1` (compact), `mb-1.5` (standard)
- **Flex gap**: `gap-1.5` (icon+text), `gap-2` (inline), `gap-3` (groups), `gap-4` (cards)
- **Table cells**: `px-6 py-3` (header), `px-6 py-4` (body)

## Focus / Active States

**Focus ring light**: `box-shadow: 0 0 0 3px rgba(124,58,237,0.15), 0 0 20px 2px rgba(124,58,237,0.08)`
**Focus ring dark**: `box-shadow: 0 0 0 3px rgba(96,165,250,0.25), 0 0 24px 4px rgba(96,165,250,0.12)`
**Global active**: `button:active:not(:disabled) { transform: scale(0.96) }`
**Card active**: `active:scale-[0.97]` (selection), `active:scale-[0.99]` (tap)

## Transitions

- Cards: `transition-all duration-200`
- Colors only: `transition-colors`
- Chevron rotate: `transition-transform duration-300`
- Accordion: `duration: 0.3, ease: "easeInOut"`
- Modal spring: `{ stiffness: 460, damping: 34, mass: 0.65 }`

## Dark Mode Pattern

| Rol | Light | Dark |
|---|---|---|
| Page/card bg | `bg-white` | `dark:bg-zinc-900` |
| Input bg | `bg-white` | `dark:bg-zinc-800` |
| Borders | `border-zinc-200` | `dark:border-zinc-800` o `dark:border-zinc-700` |
| Primary text | `text-gray-900` | `dark:text-white` |
| Secondary text | `text-gray-700` | `dark:text-gray-300` |
| Muted text | `text-zinc-500` | `dark:text-zinc-400` |
| Table header bg | `bg-slate-50` | `dark:bg-zinc-800` |
| Table row hover | `hover:bg-slate-100` | `dark:hover:bg-zinc-800` |

## Animaciones (globals.css)

- `animate-slide-up` — slide up fade in (0.25s)
- `animate-pulse-glow` — violet glow pulse (2s infinite)
- `animate-pulse-border` — red border pulse (1.5s infinite)
- `glass-sheen-card` — light sweep effect (14s cycle)
- `hold-active` — hold-to-submit circle fill + inflation (0.8s)
- Reduced motion: todas las animaciones a 0.01ms

## Scrollbar

- Default: `scrollbar-width: thin`, thumb `rgba(0,0,0,0.1)` light / `rgba(255,255,255,0.1)` dark
- `.delicate-scroll`: hover-reveal scrollbar
- `.no-scrollbar`: oculto completamente

## Booking Theme System (74 keys)

Archetypes: `minimal-light`, `carbon-glass`, `editorial-cream`, `pastel-colorful`
Resolución: `resolveTemplate(templateId)` → base + overrides

**Keys más usados**:
- `shell`, `page` — contenedor principal
- `selected`, `plain`, `plate` — estados de card
- `ctaMain`, `next`, `back`, `ghostBtn` — botones
- `input` — campos de formulario
- `checkout`, `checkoutKicker`, `checkoutTitle`, `checkoutAmount` — resumen de pago
- `heading`, `tiny`, `label` — tipografía
- `accent` — color de acento
- `progressTrack`, `progressFill` — barra de progreso
- `cardDepth` — sombra de card

**3D card interaction**: `pushCard3D`/`releaseCard3D` via pointer events, perspective(800px)
**Ripple selection**: multi-wave radial expansion on select
**Selection glow**: inset + outer shadow pulse, 2.8s infinite

## Componentes UI (`src/components/ui/`)

- `button.tsx` — base button con `hover:scale-[1.02] active:scale-[0.96]`
- `modal.tsx` — dialog con spring animation
- `sheet.tsx` — side panel
- `confirm-dialog.tsx` — confirmación inline
- `toast.tsx` — notificaciones
- `custom-select.tsx` — select custom con dropdown
- `tag-chips.tsx` — chips de tags
- `state-panel.tsx` — empty/error states reutilizables
- `input.tsx`, `label.tsx` — inputs base

## Utility

- `cn()` de `@/lib/utils` para merge de clases Tailwind
- CSS class `.ui-card`, `.ui-badge`, `.ui-btn-primary`, `.ui-btn-ghost`, `.ui-select` — usarlas en vez de recrear estilos
