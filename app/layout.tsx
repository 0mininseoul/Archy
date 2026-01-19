import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { I18nProvider, Locale } from "@/lib/i18n";
import { pretendard } from "@/lib/fonts";
import { ClientProviders } from "./client-providers";

export const metadata: Metadata = {
  title: "Archy - 자동 음성 문서화 서비스",
  description: "녹음 버튼 하나만 누르면, 자동으로 정리된 문서를 받아볼 수 있는 자동문서화 솔루션",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/apple-touch-icon.png",
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "https://www.archynotes.com",
    siteName: "Archy",
    title: "Archy - 자동 음성 문서화 서비스",
    description: "녹음 버튼 하나만 누르면, 자동으로 정리된 문서를 받아볼 수 있는 자동문서화 솔루션",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Archy - 자동 음성 문서화 서비스",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Archy - 자동 음성 문서화 서비스",
    description: "녹음 버튼 하나만 누르면, 자동으로 정리된 문서를 받아볼 수 있는 자동문서화 솔루션",
    images: ["/og-image.png"],
  },
};

export const viewport = {
  themeColor: "#ffffff",
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
  const localeCookie = cookieStore.get("archy_locale")?.value;
  const initialLocale: Locale = (localeCookie === "en" ? "en" : "ko");

  return (
    <html lang={initialLocale} className={pretendard.variable}>
      <head>
        {/* iOS PWA Support */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Archy" />

        {/* iOS PWA Splash Screens */}
        {/* iPhone SE (2nd/3rd gen), 8 - 750x1334 -> fallback to 828x1792 */}
        <link rel="apple-touch-startup-image" href="/splashscreens/splash-828x1792.png" media="screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPhone 8 Plus - 1242x2208 -> fallback to 1284x2778 */}
        <link rel="apple-touch-startup-image" href="/splashscreens/splash-1284x2778.png" media="screen and (device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone XR, 11 - 828x1792 */}
        <link rel="apple-touch-startup-image" href="/splashscreens/splash-828x1792.png" media="screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPhone X, XS, 11 Pro - 1125x2436 */}
        <link rel="apple-touch-startup-image" href="/splashscreens/splash-1125x2436.png" media="screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone XS Max, 11 Pro Max - 1242x2688 -> fallback to 1284x2778 */}
        <link rel="apple-touch-startup-image" href="/splashscreens/splash-1284x2778.png" media="screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 12 mini, 13 mini - 1080x2340 */}
        <link rel="apple-touch-startup-image" href="/splashscreens/splash-1080x2340.png" media="screen and (device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 12, 12 Pro, 13, 13 Pro, 14 - 1170x2532 */}
        <link rel="apple-touch-startup-image" href="/splashscreens/splash-1170x2532.png" media="screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 12 Pro Max, 13 Pro Max, 14 Plus - 1284x2778 */}
        <link rel="apple-touch-startup-image" href="/splashscreens/splash-1284x2778.png" media="screen and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 14 Pro, 15, 15 Pro, 16, 16 Pro - 1179x2556 */}
        <link rel="apple-touch-startup-image" href="/splashscreens/splash-1179x2556.png" media="screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus, 16 Pro Max - 1290x2796 */}
        <link rel="apple-touch-startup-image" href="/splashscreens/splash-1290x2796.png" media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
      </head>
      <body className={`${pretendard.className} antialiased`}>
        <I18nProvider initialLocale={initialLocale}>
          <ClientProviders />
          {children}
          <SpeedInsights />
        </I18nProvider>
      </body>
    </html>
  );
}
