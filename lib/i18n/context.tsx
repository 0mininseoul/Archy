"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Locale, translations } from "./translations";

// Use a more flexible type that allows any translation value
type TranslationValue = string | { [key: string]: TranslationValue };
type Translations = { [key: string]: TranslationValue };

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: typeof translations.ko;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// Cookie name for language preference
const LOCALE_COOKIE = "flownote_locale";

// Helper to get cookie value
function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift();
  return undefined;
}

// Helper to set cookie
function setCookie(name: string, value: string, days: number = 365) {
  if (typeof document === "undefined") return;
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

interface I18nProviderProps {
  children: React.ReactNode;
  initialLocale?: Locale;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale || "ko");
  const [mounted, setMounted] = useState(false);

  // Initialize locale from cookie or server-provided value
  useEffect(() => {
    const cookieLocale = getCookie(LOCALE_COOKIE) as Locale | undefined;
    if (cookieLocale && (cookieLocale === "ko" || cookieLocale === "en")) {
      setLocaleState(cookieLocale);
    } else if (initialLocale) {
      setLocaleState(initialLocale);
    }
    setMounted(true);
  }, [initialLocale]);

  // Update locale and persist to cookie
  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    setCookie(LOCALE_COOKIE, newLocale);

    // Update HTML lang attribute
    if (typeof document !== "undefined") {
      document.documentElement.lang = newLocale;
    }
  }, []);

  // Update locale in database when user is authenticated
  const updateLocaleInDb = useCallback(async (newLocale: Locale) => {
    try {
      await fetch("/api/user/language", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: newLocale }),
      });
    } catch (error) {
      console.error("Failed to update language preference:", error);
    }
  }, []);

  // Wrapper that updates both cookie and database
  const setLocaleWithPersist = useCallback((newLocale: Locale) => {
    setLocale(newLocale);
    updateLocaleInDb(newLocale);
  }, [setLocale, updateLocaleInDb]);

  const value: I18nContextType = {
    locale,
    setLocale: setLocaleWithPersist,
    t: translations[locale] as typeof translations.ko,
  };

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <I18nContext.Provider value={{ locale: initialLocale || "ko", setLocale: setLocaleWithPersist, t: translations[initialLocale || "ko"] as typeof translations.ko }}>
        {children}
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

// Export the hook to get just translations for convenience
export function useTranslations() {
  const { t } = useI18n();
  return t;
}
