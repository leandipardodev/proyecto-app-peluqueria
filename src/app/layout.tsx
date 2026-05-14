import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Klip - Sistema de gestion para peluquerias",
  description: "Sistema de gestion para peluquerias",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Klip",
  },
  icons: {
    apple: "/apple-touch-icon.png",
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F5F7" },
    { media: "(prefers-color-scheme: dark)", color: "#09090B" },
  ],
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
