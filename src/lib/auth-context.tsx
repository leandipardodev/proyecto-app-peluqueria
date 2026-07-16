"use client";

import { createContext, useCallback, useContext, useEffect, useState, useMemo, useRef, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { resolveIndustry } from "@/lib/industry/resolve";
import type { Industry } from "@/lib/industry/types";
import { usePathname, useRouter } from "next/navigation";
import { DASHBOARD_LEGACY_SEGMENTS_SET } from "@/lib/dashboard/shared/legacy-segments";

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
  bankTransferEnabled: boolean;
};

type AuthState = {
  user: UserInfo | null;
  shop: ShopInfo | null;
  isLoading: boolean;
};

type AuthInitData = { user: UserInfo | null; shop: ShopInfo | null };

function readServerAuthData(): AuthInitData | null {
  if (typeof document === "undefined") return null;
  try {
    const el = document.getElementById("__AUTH_INIT__");
    if (!el?.textContent) return null;
    return JSON.parse(el.textContent) as AuthInitData;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthState>({
  user: null,
  shop: null,
  isLoading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const data = readServerAuthData();
    return {
      user: data?.user ?? null,
      shop: data?.shop ?? null,
      isLoading: !data,
    };
  });
  const pathname = usePathname();
  const router = useRouter();

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
  const fetchInitiatedRef = useRef(false);

  const fetchSession = useCallback(async (userOverride?: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) => {
    const seq = ++fetchVersionRef.current;

    let user = userOverride ?? null;
    if (!user) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        user = session?.user ?? null;
      } catch {
        await supabase.auth.signOut();
        setState({ user: null, shop: null, isLoading: false });
        return;
      }
    }

    if (!user) {
      setState({ user: null, shop: null, isLoading: false });
      return;
    }

    let profile: { shop_id: string | null; name: string | null; role: string | null } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data } = await supabase
        .from("user_profiles")
        .select("shop_id, name, role")
        .eq("user_id", user.id)
        .maybeSingle();
      profile = data;
      if (profile) break;
      if (attempt < 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
    }

    const metaName: string | null = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
    const metaAvatar: string | null = typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null;
    const metaPhone: string | null = typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : null;

    if (!profile) {
      if (seq === fetchVersionRef.current) setState({
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

    let resolvedShop: ShopInfo | null = null;
    if (profile.shop_id) {
      const { data: shop } = await supabase
        .from("shops")
        .select("id, nombre, slug, industry, active, plan_expiry, bank_transfer_enabled")
        .eq("id", profile.shop_id)
        .maybeSingle();
      if (shop) {
        resolvedShop = { id: shop.id, name: shop.nombre, slug: shop.slug, industry: resolveIndustry(shop.industry), planExpiry: shop.plan_expiry, active: shop.active ?? false, bankTransferEnabled: shop.bank_transfer_enabled ?? false };
      }
    }

    if (seq === fetchVersionRef.current) {
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
        if (resolvedShop) {
          router.replace(`/dashboard/${resolvedShop.slug}`);
        }
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
  }, [router]);

  useEffect(() => {
    if (!state.isLoading) return;
    if (fetchInitiatedRef.current) return;
    fetchInitiatedRef.current = true;

    const data = readServerAuthData();
    if (data) {
      setState({ user: data.user, shop: data.shop, isLoading: false });
      return;
    }

    fetchSession();
  }, [state.isLoading, fetchSession]);

  useEffect(() => {
    if (state.isLoading) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        setState({ user: null, shop: null, isLoading: false });
      } else if (event === "SIGNED_IN") {
        fetchSession(session.user).catch(() => {
          setState({ user: null, shop: null, isLoading: false });
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [state.isLoading, fetchSession]);

  useEffect(() => {
    if (!state.user || !pathnameShopSlug) return;
    if (state.shop?.slug === pathnameShopSlug) return;
    let isMounted = true;

    const fetchShopBySlug = async () => {
      const { data: shop } = await supabase
        .from("shops")
        .select("id, nombre, slug, industry, active, plan_expiry, bank_transfer_enabled")
        .eq("slug", pathnameShopSlug)
        .maybeSingle();

      if (shop && isMounted) {
        setState(prev => ({
          ...prev,
          shop: { id: shop.id, name: shop.nombre, slug: shop.slug, industry: resolveIndustry(shop.industry), planExpiry: shop.plan_expiry, active: shop.active ?? false, bankTransferEnabled: shop.bank_transfer_enabled ?? false },
        }));
      }
    };

    fetchShopBySlug();
    return () => { isMounted = false; };
  }, [pathnameShopSlug, state.user?.id]);

  const contextValue = useMemo(() => state, [
    state.user?.id ?? null,
    state.user?.role ?? null,
    state.shop?.id ?? null,
    state.shop?.slug ?? null,
    state.shop?.active ?? null,
    state.shop?.bankTransferEnabled ?? null,
    state.isLoading,
  ]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
