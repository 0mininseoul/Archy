import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { RegisterServiceWorker } from "./register-sw";
import { I18nProvider, Locale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Flownote - 자동 음성 문서화 서비스",
  description: "녹음 버튼 하나만 누르면, 자동으로 정리된 문서를 받아볼 수 있는 자동문서화 솔루션",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
          as="style"
          crossOrigin=""
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="font-sans antialiased">
        <I18nProvider initialLocale={initialLocale}>
          <RegisterServiceWorker />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
