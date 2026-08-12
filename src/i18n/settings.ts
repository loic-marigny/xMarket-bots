import type { Locale } from "date-fns";
import { arSA, enUS, fr, ru, zhCN } from "date-fns/locale";
import arTranslations from "./locales/ar.json";
import en from "./locales/en.json";
import frTranslations from "./locales/fr.json";
import ruTranslations from "./locales/ru.json";
import zhTranslations from "./locales/zh.json";

export const defaultLanguage = "fr";
export const fallbackLanguage = "en";
export const languageStorageKey = "language";

export const resources = {
  ar: { translation: arTranslations },
  en: { translation: en },
  fr: { translation: frTranslations },
  ru: { translation: ruTranslations },
  zh: { translation: zhTranslations },
} as const;

export type AppLanguage = keyof typeof resources;

export const supportedLanguages: AppLanguage[] = Object.keys(resources) as AppLanguage[];

export const languageLabels: Record<AppLanguage, string> = {
  ar: "AR",
  en: "EN",
  fr: "FR",
  ru: "RU",
  zh: "中文",
};

export const languageNames: Record<AppLanguage, string> = {
  ar: "العربية (السعودية)",
  en: "English",
  fr: "Français",
  ru: "Русский",
  zh: "中文（简体）",
};

const languageDirections: Record<AppLanguage, "ltr" | "rtl"> = {
  ar: "rtl",
  en: "ltr",
  fr: "ltr",
  ru: "ltr",
  zh: "ltr",
};

const dateFnsLocales: Record<AppLanguage, Locale> = {
  ar: arSA,
  en: enUS,
  fr,
  ru,
  zh: zhCN,
};

const intlLocales: Record<AppLanguage, string> = {
  ar: "ar-SA",
  en: "en-US",
  fr: "fr-FR",
  ru: "ru-RU",
  zh: "zh-CN",
};

export function resolveLanguage(language?: string | null): AppLanguage {
  if (!language) return defaultLanguage;
  const normalized = language.toLowerCase().split("-")[0] as AppLanguage;
  return supportedLanguages.includes(normalized) ? normalized : fallbackLanguage;
}

export function getDateFnsLocale(language?: string | null): Locale {
  return dateFnsLocales[resolveLanguage(language)];
}

export function getIntlLocale(language?: string | null): string {
  return intlLocales[resolveLanguage(language)];
}

export function getLanguageDirection(language?: string | null): "ltr" | "rtl" {
  return languageDirections[resolveLanguage(language)];
}

export function isRtlLanguage(language?: string | null): boolean {
  return getLanguageDirection(language) === "rtl";
}

export function getStoredLanguage(): AppLanguage {
  if (typeof window === "undefined") return defaultLanguage;
  return resolveLanguage(window.localStorage.getItem(languageStorageKey));
}
