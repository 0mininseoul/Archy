import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { RegisterServiceWorker } from "./register-sw";
import { I18nProvider, Locale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Flownote - 자동 음성 문서화 서비스",
  description: "녹음 버튼 하나만 누르면, 자동으로 정리된 문서를 받아볼 수 있는 자동문서화 솔루션",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/apple-touch-icon.png",
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "https://flownote.vercel.app",
    siteName: "Flownote",
    title: "Flownote - 자동 음성 문서화 서비스",
    description: "녹음 버튼 하나만 누르면, 자동으로 정리된 문서를 받아볼 수 있는 자동문서화 솔루션",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Flownote - 자동 음성 문서화 서비스",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Flownote - 자동 음성 문서화 서비스",
    description: "녹음 버튼 하나만 누르면, 자동으로 정리된 문서를 받아볼 수 있는 자동문서화 솔루션",
    images: ["/og-image.png"],
  },
};

export const viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get locale from cookie (set by middleware)
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("flownote_locale")?.value;
  const initialLocale: Locale = (localeCookie === "en" ? "en" : "ko");

  return (
    <html lang={initialLocale}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
        {/* iOS PWA Support */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Flownote" />
      </head>
      <body className="font-sans antialiased">
        <I18nProvider initialLocale={initialLocale}>
          <RegisterServiceWorker />
          {children}
          <SpeedInsights />
        </I18nProvider>
      </body>
    </html>
  );
}
