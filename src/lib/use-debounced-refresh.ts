import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

export function useDebouncedRefresh(delay = 2000) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      router.refresh();
    }, delay);
  }, [router, delay]);

  return refresh;
}
