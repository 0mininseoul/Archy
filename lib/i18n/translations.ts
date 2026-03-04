export type Locale = "ko" | "en";
type TranslationShape = typeof import("./locales/ko").ko;

type DeepWiden<T> =
  T extends string ? string :
  T extends number ? number :
  T extends boolean ? boolean :
  T extends readonly (infer U)[] ? DeepWiden<U>[] :
  T extends object ? { [K in keyof T]: DeepWiden<T[K]> } :
  T;

export type TranslationKeys = DeepWiden<TranslationShape>;

export const defaultLocale: Locale = "ko";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "ko" || value === "en";
}

export async function loadTranslations(locale: Locale): Promise<TranslationKeys> {
  if (locale === "en") {
    const { en } = await import("./locales/en");
    return en as unknown as TranslationKeys;
  }

  const { ko } = await import("./locales/ko");
  return ko as unknown as TranslationKeys;
}
