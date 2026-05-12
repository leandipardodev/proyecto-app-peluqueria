"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

interface GoogleSignInButtonProps {
  shopSlug?: string;
  className?: string;
}

export default function GoogleSignInButton({ shopSlug, className = "" }: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSignIn() {
    setLoading(true);
    const origin = window.location.origin;
    
    // Pasamos el shopSlug en el state para que el callback sepa a dónde volver
    const stateData = { shopSlug };
    const state = encodeURIComponent(JSON.stringify(stateData));
    
    const redirectTo = `${origin}/auth/callback?state=${state}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      console.error("Error signing in with Google:", error.message);
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleSignIn}
      disabled={loading}
      className={`relative group overflow-hidden px-6 py-3 rounded-2xl transition-all duration-300 ${className}
        bg-white/10 dark:bg-black/10 backdrop-blur-md 
        border border-white/20 dark:border-white/10
        hover:border-white/40 dark:hover:border-white/20
        active:scale-95 disabled:opacity-50 disabled:pointer-events-none
        flex items-center justify-center gap-3 w-full shadow-lg shadow-black/5`}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      {loading ? (
        <span className="w-5 h-5 border-2 border-zinc-400 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-400 rounded-full animate-spin" />
      ) : (
        <>
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Continuar con Google
          </span>
        </>
      )}
    </button>
  );
}
