import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import WebVitalsReporter from "@/components/perf/web-vitals-reporter";
import { GoogleAnalytics } from "@/components/google-analytics";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/seo";

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS, Android",
  description: SITE_DESCRIPTION,
  url: absoluteUrl("/"),
  image: absoluteUrl("/hero.png"),
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "ARS",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: absoluteUrl("/"),
  logo: absoluteUrl("/dix-logo.svg"),
  description: SITE_DESCRIPTION,
  sameAs: [],
};

export const metadata: Metadata = {
  metadataBase: new URL(absoluteUrl("/")),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  alternates: {
    canonical: "/",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  referrer: "origin-when-cross-origin",
  keywords: [
    "software para peluquerias",
    "sistema para barberias",
    "software para dueños de peluqueria",
    "agenda para peluquerias",
    "agenda de turnos",
    "reservas online",
    "gestion de clientes",
    "control de inventario",
    "finanzas peluqueria",
    "mercado pago peluqueria",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    images: [
      {
        url: "/hero.png",
        width: 1200,
        height: 630,
        alt: "Klip - Gestion para peluquerias",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/hero.png"],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Klip",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
      <link rel="icon" href="/favicon/favicon_light_mode_32x32.png" media="(prefers-color-scheme: light)" sizes="32x32" type="image/png" />
      <link rel="icon" href="/favicon/favicon_dark_mode_32x32.png" media="(prefers-color-scheme: dark)" sizes="32x32" type="image/png" />
      <link rel="icon" href="/favicon/favicon_light_mode_64x64.png" media="(prefers-color-scheme: light)" sizes="64x64" type="image/png" />
      <link rel="icon" href="/favicon/favicon_dark_mode_64x64.png" media="(prefers-color-scheme: dark)" sizes="64x64" type="image/png" />
      <body className="antialiased bg-gradient-to-br from-slate-50 via-white to-zinc-100 dark:bg-gradient-to-br dark:from-zinc-950 dark:via-zinc-900 dark:to-black text-gray-900 dark:text-zinc-400 transition-colors">
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var style = document.createElement('style');
                style.textContent = '#klip-splash{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:linear-gradient(to bottom,#f8fafc,#ffffff,#f4f4f5);transition:opacity .5s ease}#klip-splash img{width:180px;height:auto}#klip-splash.fade-out{opacity:0;pointer-events:none}';
                document.head.appendChild(style);
                var el = document.createElement('div');
                el.id = 'klip-splash';
                el.innerHTML = '<img src="/icons/splash-logo.png" alt="">';
                document.body.insertBefore(el, document.body.firstChild);
                function hide() {
                  if (el.classList.contains('fade-out')) return;
                  el.classList.add('fade-out');
                  setTimeout(function() { if (el.parentNode) el.remove(); }, 500);
                }
                if (document.readyState === 'complete') {
                  setTimeout(hide, 0);
                } else {
                  window.addEventListener('load', hide);
                }
              })();
            `,
          }}
        />
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-white focus:text-slate-900 focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-sky-500">
          Saltar al contenido principal
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 right-0 h-[800px] w-[800px] rounded-full bg-violet-300/20 blur-[150px] dark:bg-violet-500/15" />
          <div className="absolute top-1/2 -left-40 h-[900px] w-[900px] rounded-full bg-cyan-300/20 blur-[150px] dark:bg-cyan-500/15" />
          <div className="absolute -bottom-40 left-1/3 h-[800px] w-[800px] rounded-full bg-pink-300/20 blur-[150px] dark:bg-pink-500/15" />
        </div>
        <div className="relative z-10" id="main-content">
          <Providers>
            <GoogleAnalytics />
            <WebVitalsReporter />
            {children}
          </Providers>
        </div>
      </body>
    </html>
  );
}
