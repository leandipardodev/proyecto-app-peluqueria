"use client";

import { useState } from "react";
import { LogIn, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useKlipSounds } from "@/lib/use-klip-sounds";

type GoogleSignInButtonProps = {
  shopSlug: string;
  className?: string;
};

export default function GoogleSignInButton({ shopSlug, className }: GoogleSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { playClick } = useKlipSounds();

  async function handleSignIn() {
    try {
      playClick();
      setIsLoading(true);
      const redirectTo = `${window.location.origin}/auth/callback?next=/book/${shopSlug}`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (error) {
        setIsLoading(false);
        console.error("[GoogleSignInButton] OAuth error:", error.message);
      }
    } catch (error) {
      setIsLoading(false);
      console.error("[GoogleSignInButton] Unexpected error:", error);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignIn}
      disabled={isLoading}
      className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-sm font-medium text-gray-900 dark:text-white hover:bg-white/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed ${className ?? ""}`}
    >
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
      {isLoading ? "Conectando con Google..." : "Continuar con Google"}
    </button>
  );
}
