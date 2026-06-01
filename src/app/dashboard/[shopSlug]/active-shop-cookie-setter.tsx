"use client";

import { useEffect } from "react";

const COOKIE_NAME = "klip_active_shop_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export default function ActiveShopCookieSetter({
  shopId,
}: {
  shopId: string | null;
}) {
  useEffect(() => {
    if (!shopId) return;
    const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
    document.cookie = `${COOKIE_NAME}=${shopId}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${isSecure ? "; Secure" : ""}`;
  }, [shopId]);

  return null;
}
