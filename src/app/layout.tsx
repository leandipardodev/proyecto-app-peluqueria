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
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
