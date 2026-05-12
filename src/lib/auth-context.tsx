"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

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
    const supabase = createClient();

    async function fetchSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setState({ user: null, shop: null, isLoading: false });
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
        setState({
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
        .select("id, name, slug")
        .eq("id", profile.shop_id)
        .single();

      setState({
        user: {
          id: user.id,
          email: user.email ?? null,
          name: profile.name ?? metaName,
          avatarUrl: metaAvatar,
          phone: metaPhone,
          role: profile.role,
        },
        shop: shop ? { id: shop.id, name: shop.name, slug: shop.slug } : null,
        isLoading: false,
      });
    }

    fetchSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED" && !supabase.auth.getUser()) {
        setState({ user: null, shop: null, isLoading: false });
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        fetchSession();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
