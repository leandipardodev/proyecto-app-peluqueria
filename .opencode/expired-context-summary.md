# Project Summary

## Goal
App de gestión de peluquería con Next.js 16, App Router, Supabase, Tailwind v4.

## Done
- Stock redesign: card grid layout (3 columns, gradient icons, quantity/cost/total per card, +/- quick adjust buttons, queued adjustments with auto-save, delete with confirm dialog, search with low-stock badges, total value footer).
- `stock-table.tsx`: full rewrite from table → card grid, realtime sync via Supabase, debounced batch adjustments, `memo` for perf.
- `add-product-modal.tsx`: polished modal with gradient icon header, spring animation, split quantity/cost inputs, matching services modal style.
- `inventory-page-client.tsx`: cleaned up header with subtitle, secondary "Agregar múltiples" button.
- Notifications in header with dropdown panel, auto-confirm appointments, bulk complete from panel.
- Dashboard with revenue/expense chart toggling (Hoy/Semana/Mes), weekly breakdown (8 weeks), busiest day/hour.
- Customers page: pagination (50/page), search with debounce.
- Migration `071_add_customer_tags.sql` applied.

## Blocked
- (none)

## Next
- Polish `batch-add-product-modal.tsx` to match the new design language (gradient icon, cleaner layout).
- Verify deployment on Vercel.
