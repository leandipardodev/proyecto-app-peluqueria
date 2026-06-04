"use client";

import { useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function PullToRefresh({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isCalendar = pathname.includes("/calendar");
  const startY = useRef(0);
  const [pulling, setPulling] = useState(false);
  const [pullDist, setPullDist] = useState(0);

  function onTouchStart(e: React.TouchEvent) {
    if (isCalendar) return;
    if (window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (isCalendar) return;
    if (window.scrollY > 0) return;
    const dist = e.touches[0].clientY - startY.current;
    if (dist > 0) {
      setPulling(true);
      setPullDist(Math.min(dist, 120));
    }
  }

  function onTouchEnd() {
    if (isCalendar) return;
    if (pullDist >= 60) {
      window.location.reload();
    }
    setPulling(false);
    setPullDist(0);
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="relative min-h-0"
    >
      {pulling && (
        <div
          className="flex items-center justify-center transition-all"
          style={{ height: pullDist * 0.5 }}
        >
          <RefreshCw
            className={`h-5 w-5 text-zinc-500 ${pullDist >= 60 ? "" : "animate-spin"}`}
            style={{ transform: `rotate(${pullDist * 3}deg)` }}
          />
        </div>
      )}
      {children}
    </div>
  );
}
