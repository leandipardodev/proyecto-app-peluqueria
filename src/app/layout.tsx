import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jazba Peluqueria - SaaS",
  description: "Sistema de gestion para peluquerias",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased bg-gradient-to-br from-slate-50 via-white to-zinc-100 dark:bg-gradient-to-br dark:from-zinc-950 dark:via-zinc-900 dark:to-black text-gray-900 dark:text-zinc-400 transition-colors">
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 right-0 h-[800px] w-[800px] rounded-full bg-violet-300/20 blur-[150px] dark:bg-violet-500/15" />
          <div className="absolute top-1/2 -left-40 h-[900px] w-[900px] rounded-full bg-cyan-300/20 blur-[150px] dark:bg-cyan-500/15" />
          <div className="absolute -bottom-40 left-1/3 h-[800px] w-[800px] rounded-full bg-pink-300/20 blur-[150px] dark:bg-pink-500/15" />
        </div>
        <div className="relative z-10">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
