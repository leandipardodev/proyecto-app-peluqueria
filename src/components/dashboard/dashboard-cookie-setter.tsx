"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { usePathname } from "next/navigation";
import { DASHBOARD_LEGACY_SEGMENTS_SET } from "@/lib/dashboard/shared/legacy-segments";

const COOKIE_NAME = "klip_active_shop_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export default function DashboardCookieSetter() {
  const pathname = usePathname();

  useEffect(() => {
    const parts = pathname.split("/").filter(Boolean);
    const slug = parts[1];
    if (parts[0] !== "dashboard" || !slug || DASHBOARD_LEGACY_SEGMENTS_SET.has(slug)) return;

    const fetchAndSet = async () => {
      const { data: shop } = await supabase
        .from("shops")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (shop?.id) {
        document.cookie = `${COOKIE_NAME}=${shop.id}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
      }
    };

    fetchAndSet();
  }, [pathname]);

  return null;
}
