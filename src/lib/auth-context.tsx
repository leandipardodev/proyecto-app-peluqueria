"use client";

import { createContext, useContext, useEffect, useState, useMemo, useRef, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { resolveIndustry } from "@/lib/industry/resolve";
import type { Industry } from "@/lib/industry/types";
import { usePathname } from "next/navigation";
import { DASHBOARD_LEGACY_SEGMENTS_SET } from "@/lib/dashboard/legacy-segments";

export type UserInfo = {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  phone: string | null;
  role: string | null;
};

export type ShopInfo = {
  id: string;
  name: string;
  slug: string;
  industry: Industry;
  planExpiry: string | null;
  active: boolean;
};

type AuthState = {
  user: UserInfo | null;
  shop: ShopInfo | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthState>({
  user: null,
  shop: null,
  isLoading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, shop: null, isLoading: true });
  const pathname = usePathname();

  const pathnameShopSlug = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const slug = parts[1];
    if (parts[0] === "dashboard" && slug && !DASHBOARD_LEGACY_SEGMENTS_SET.has(slug)) return slug;
    return null;
  }, [pathname]);

  const pathnameShopSlugRef = useRef(pathnameShopSlug);
  useEffect(() => {
    pathnameShopSlugRef.current = pathnameShopSlug;
  }, [pathnameShopSlug]);

  const fetchVersionRef = useRef(0);

  useEffect(() => {
    let isMounted = true;

    async function fetchSession(userOverride?: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
      const seq = ++fetchVersionRef.current;

      let user = userOverride ?? null;
      if (!user) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        user = session?.user ?? null;
      }

      if (!user) {
        if (isMounted) setState({ user: null, shop: null, isLoading: false });
        return;
      }

      let profile: { shop_id: string | null; name: string | null; role: string | null } | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data } = await supabase
          .from("user_profiles")
          .select("shop_id, name, role")
          .eq("user_id", user.id)
          .maybeSingle();
        profile = data;
        if (profile) break;
        if (attempt < 2) {
          await new Promise((resolve) => window.setTimeout(resolve, 220 * (attempt + 1)));
        }
      }

      const metaName: string | null = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
      const metaAvatar: string | null = typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null;
      const metaPhone: string | null = typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : null;

      if (!profile) {
        if (isMounted && seq === fetchVersionRef.current) setState({
          user: {
            id: user.id,
            email: user.email ?? null,
            name: metaName,
            avatarUrl: metaAvatar,
            phone: metaPhone,
            role: null,
          },
          shop: null,
          isLoading: false,
        });
        return;
      }

      const { data: shop } = await supabase
        .from("shops")
        .select("id, nombre, slug, industry, active, plan_expiry")
        .eq("id", profile.shop_id)
        .maybeSingle();

      if (isMounted && seq === fetchVersionRef.current) {
        const resolvedShop = shop ? { id: shop.id, name: shop.nombre, slug: shop.slug, industry: resolveIndustry(shop.industry), planExpiry: shop.plan_expiry, active: shop.active } : null;
        const currentSlug = pathnameShopSlugRef.current;
        const slugMismatch = currentSlug && resolvedShop && resolvedShop.slug !== currentSlug;

        if (slugMismatch) {
          setState(prev => ({
            ...prev,
            user: {
              id: user.id,
              email: user.email ?? null,
              name: profile.name ?? metaName,
              avatarUrl: metaAvatar,
              phone: metaPhone,
              role: profile.role,
            },
            isLoading: false,
          }));
        } else {
          setState({
            user: {
              id: user.id,
              email: user.email ?? null,
              name: profile.name ?? metaName,
              avatarUrl: metaAvatar,
              phone: metaPhone,
              role: profile.role,
            },
            shop: resolvedShop,
            isLoading: false,
          });
        }
      }
    }

    fetchSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        setState({ user: null, shop: null, isLoading: false });
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        fetchSession(session.user);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!state.user || !pathnameShopSlug) return;
    if (state.shop?.slug === pathnameShopSlug) return;
    let isMounted = true;

    const fetchShopBySlug = async () => {
      const { data: shop } = await supabase
        .from("shops")
        .select("id, nombre, slug, industry, active, plan_expiry")
        .eq("slug", pathnameShopSlug)
        .maybeSingle();

      if (shop && isMounted) {
        setState(prev => ({
          ...prev,
          shop: { id: shop.id, name: shop.nombre, slug: shop.slug, industry: resolveIndustry(shop.industry), planExpiry: shop.plan_expiry, active: shop.active },
        }));
      }
    };

    fetchShopBySlug();
    return () => { isMounted = false; };
  }, [pathnameShopSlug, state.user]);

  const contextValue = useMemo(() => state, [
    state.user?.id ?? null,
    state.shop?.id ?? null,
    state.isLoading,
  ]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
