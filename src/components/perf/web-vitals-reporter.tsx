"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";

type WebVitalPayload = {
  id: string;
  name: string;
  value: number;
  rating: string;
  delta: number;
  navigationType: string;
  pathname: string;
};

export default function WebVitalsReporter() {
  const pathname = usePathname();

  useReportWebVitals((metric) => {
    const body: WebVitalPayload = {
      id: metric.id,
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      navigationType: metric.navigationType,
      pathname: pathname || "unknown",
    };

    const serialized = JSON.stringify(body);

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([serialized], { type: "application/json" });
      navigator.sendBeacon("/api/perf/web-vitals", blob);
      return;
    }

    void fetch("/api/perf/web-vitals", {
      method: "POST",
      body: serialized,
      headers: { "content-type": "application/json" },
      keepalive: true,
    });
  });

  return null;
}
