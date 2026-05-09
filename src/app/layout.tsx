import type { Metadata } from "next";
import "./globals.css";

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
      <body className="antialiased bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors">{children}</body>
    </html>
  );
}
