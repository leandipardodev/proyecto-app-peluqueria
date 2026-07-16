"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { resolveIndustry } from "@/lib/industry/resolve";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import type { IndustryFeatures } from "@/lib/industry/types";

export function useFeatures(): IndustryFeatures {
  const { shop } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const [features, setFeatures] = useState<IndustryFeatures>(() => INDUSTRY_CONFIG[industry].features);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const fetchFeatures = async () => {
      try {
        const res = await fetch(`/api/industry/features?industry=${industry}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { features: IndustryFeatures };
        if (!cancelled) setFeatures(data.features);
      } catch {
        // fallback to initial value
      }
    };

    fetchFeatures();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [industry]);

  return features;
}

const FEATURE_CACHE_TTL = 5 * 60 * 1000;
const featuresCache = new Map<string, { data: IndustryFeatures; ts: number }>();

export function useShopFeatures(): IndustryFeatures {
  const { shop } = useAuth();
  const shopId = shop?.id;
  const industry = resolveIndustry(shop?.industry);
  const [features, setFeatures] = useState<IndustryFeatures>(() => {
    if (shopId) {
      const cached = featuresCache.get(shopId);
      if (cached && Date.now() - cached.ts < FEATURE_CACHE_TTL) return cached.data;
    }
    return INDUSTRY_CONFIG[industry].features;
  });

  useEffect(() => {
    if (!shopId) return;

    const cached = featuresCache.get(shopId);
    if (cached && Date.now() - cached.ts < FEATURE_CACHE_TTL) {
      setFeatures(cached.data);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const fetchFeatures = async () => {
      try {
        const res = await fetch(`/api/shop/features?shopId=${shopId}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { features: IndustryFeatures };
        if (!cancelled) {
          featuresCache.set(shopId, { data: data.features, ts: Date.now() });
          setFeatures(data.features);
        }
      } catch {
        // fallback to initial value
      }
    };

    fetchFeatures();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [shopId, industry]);

  return features;
}
