"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GraduationCap } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { TUTORIALES_GUIDE } from "@/components/tutoriales/tutoriales-data";

type GuideState = { count: number; checkedAt: number };

const STATE_TTL = 60_000;
const cachedByShop = new Map<string, GuideState>();
const subscribers = new Set<(shopId: string, state: GuideState) => void>();

function publish(shopId: string, state: GuideState) {
  cachedByShop.set(shopId, state);
  subscribers.forEach((fn) => fn(shopId, state));
}

async function fetchCompletedCount(shopId: string): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("status", "completed");
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function refresh(shopId: string) {
  const count = await fetchCompletedCount(shopId);
  if (count !== null) publish(shopId, { count, checkedAt: Date.now() });
}

function useTutorialsGuide(shopId: string | null): GuideState | null {
  const [state, setState] = useState<GuideState | null>(
    shopId ? cachedByShop.get(shopId) ?? null : null,
  );

  const subscriber = useCallback((id: string, s: GuideState) => {
    if (id === shopId) setState(s);
  }, [shopId]);

  useEffect(() => {
    subscribers.add(subscriber);
    if (shopId) {
      const existing = cachedByShop.get(shopId);
      if (existing && Date.now() - existing.checkedAt < STATE_TTL) {
        setState(existing);
      } else {
        void refresh(shopId);
      }
    }
    return () => {
      subscribers.delete(subscriber);
    };
  }, [subscriber, shopId]);

  useEffect(() => {
    if (!shopId) return;

    const channel = supabase
      .channel(`tutorials-guide-${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "appointments",
          filter: `shop_id=eq.${shopId}`,
        },
        () => {
          void refresh(shopId);
        },
      )
      .subscribe();

    const onFocus = () => {
      const existing = cachedByShop.get(shopId);
      if (!existing || Date.now() - existing.checkedAt > STATE_TTL) void refresh(shopId);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
      channel.unsubscribe().catch(() => {});
    };
  }, [shopId]);

  return state;
}

export default function TutorialsGuideFab() {
  const { shop } = useAuth();
  const shopId = shop?.id ?? null;
  const state = useTutorialsGuide(shopId);
  const shouldReduceMotion = useReducedMotion();
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let frame = 0;
    function handleScroll(e: Event) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = e.target as Element | null;
        const scrolled =
          target instanceof Element ? target.scrollTop : (document.scrollingElement?.scrollTop ?? 0);
        setAtTop(scrolled <= 32);
      });
    }
    handleScroll({ target: document.scrollingElement ?? document } as unknown as Event);
    document.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", handleScroll, { capture: true } as EventListenerOptions);
    };
  }, []);

  const remaining = state ? Math.max(0, TUTORIALES_GUIDE.threshold - state.count) : null;
  const show = remaining !== null && remaining > 0 && atTop;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="tutorials-guide-fab"
          className="fixed bottom-5 right-5 z-[60] sm:bottom-6 sm:right-6"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          initial={{ opacity: 0, y: 28, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 44, scale: 0.82, filter: "blur(4px)" }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
        >
          <Link
            href={TUTORIALES_GUIDE.href}
            aria-label={`${TUTORIALES_GUIDE.label} (web de tutoriales)`}
            className="group relative block"
          >
            {!shouldReduceMotion && (
              <motion.span
                aria-hidden
                className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#0071E3] via-[#2563eb] to-[#7c3aed] opacity-45 blur-md"
                animate={{ opacity: [0.35, 0.6, 0.35] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
            <span className="relative flex items-center gap-2 rounded-full bg-gradient-to-r from-[#0071E3] via-[#2563eb] to-[#7c3aed] px-4 py-3 text-white shadow-[0_14px_34px_rgba(0,113,227,0.45)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_18px_44px_rgba(124,58,237,0.5)] group-active:scale-95">
              <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(120%_120%_at_20%_0%,rgba(255,255,255,0.28),transparent_55%)]" />
              <GraduationCap className="relative h-4.5 w-4.5" strokeWidth={2.2} />
              <span className="relative text-sm font-bold tracking-tight">{TUTORIALES_GUIDE.label}</span>
            </span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}