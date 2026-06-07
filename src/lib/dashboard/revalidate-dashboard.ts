/**
 * Revalidation is handled by:
 *  - Client-side state updates after mutations (setState)
 *  - Supabase Realtime subscriptions with cooldown
 *  - `force-dynamic` on the dashboard layout (always fresh on navigation)
 *
 * Calling revalidatePath inside server actions triggered a full RSC re-fetch
 * of the current page + layout on every mutation, causing the entire
 * dashboard (sidebar, header, content) to flash/refresh unnecessarily.
 */
export async function revalidateDashboardSegments(_shopId: string | null | undefined, _segments: string[]): Promise<void> {
  /* no-op */
}
