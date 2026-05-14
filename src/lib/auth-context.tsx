"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

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

  useEffect(() => {
    let isMounted = true;
    let isFetching = false;

    async function fetchSession(userOverride?: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
      if (isFetching) return;
      isFetching = true;

      try {
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

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("shop_id, name, role")
        .eq("user_id", user.id)
        .single();

      const metaName: string | null = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
      const metaAvatar: string | null = typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null;
      const metaPhone: string | null = typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : null;

        if (!profile) {
          if (isMounted) setState({
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
        .select("id, nombre, slug")
        .eq("id", profile.shop_id)
        .single();

        if (isMounted) setState({
          user: {
            id: user.id,
            email: user.email ?? null,
            name: profile.name ?? metaName,
            avatarUrl: metaAvatar,
            phone: metaPhone,
            role: profile.role,
          },
          shop: shop ? { id: shop.id, name: shop.nombre, slug: shop.slug } : null,
          isLoading: false,
        });
      } finally {
        isFetching = false;
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

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
