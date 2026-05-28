"use client";

import { useCallback } from "react";
import type { Industry } from "@/lib/industry/types";

type Props = {
  industry: Industry;
  feature: string;
  enabled: boolean;
  handleToggle: (formData: FormData) => Promise<void>;
};

export default function IndustryToggle({ industry, feature, enabled, handleToggle }: Props) {
  const action = useCallback(async () => {
    const fd = new FormData();
    fd.set("industry", industry);
    fd.set("feature", feature);
    fd.set("value", String(!enabled));
    await handleToggle(fd);
  }, [industry, feature, enabled, handleToggle]);

  return (
    <button
      onClick={action}
      type="button"
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:ring-offset-2 ${
        enabled ? "bg-[#0071E3]" : "bg-zinc-300"
      }`}
      role="switch"
      aria-checked={enabled}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          enabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
