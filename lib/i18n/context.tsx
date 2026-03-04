"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import {
  Locale,
  TranslationKeys,
  defaultLocale,
  isLocale,
  loadTranslations,
} from "./translations";

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslationKeys;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const LOCALE_COOKIE = "archy_locale";

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift();
  return undefined;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return;
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

interface I18nProviderProps {
  children: React.ReactNode;
  initialLocale?: Locale;
  initialTranslations?: TranslationKeys;
}

export function I18nProvider({
  children,
  initialLocale,
  initialTranslations,
}: I18nProviderProps) {
  const resolvedInitialLocale = initialLocale ?? defaultLocale;
  const [locale, setLocaleState] = useState<Locale>(resolvedInitialLocale);
  const [translations, setTranslationsState] = useState<TranslationKeys>(
    initialTranslations ?? ({} as TranslationKeys)
  );
  const translationRequestIdRef = useRef(0);

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

  useEffect(() => {
    const cookieLocale = getCookie(LOCALE_COOKIE);
    if (isLocale(cookieLocale) && cookieLocale !== locale) {
      setLocaleState(cookieLocale);
    }
  }, [locale]);

  useEffect(() => {
    const requestId = ++translationRequestIdRef.current;

    const loadByLocale = async () => {
      try {
        const loadedTranslations = await loadTranslations(locale);
        if (translationRequestIdRef.current === requestId) {
          setTranslationsState(loadedTranslations);
        }
      } catch (error) {
        console.error("Failed to load translations:", error);
      }
    };

    void loadByLocale();

    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback(
    (newLocale: Locale) => {
      setLocaleState(newLocale);
      setCookie(LOCALE_COOKIE, newLocale);
      if (typeof document !== "undefined") {
        document.documentElement.lang = newLocale;
      }
      void updateLocaleInDb(newLocale);
    },
    [updateLocaleInDb]
  );

  const value: I18nContextType = {
    locale,
    setLocale,
    t: translations,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

export function useTranslations() {
  const { t } = useI18n();
  return t;
}
