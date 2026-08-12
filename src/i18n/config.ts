import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  fallbackLanguage,
  getLanguageDirection,
  getStoredLanguage,
  resolveLanguage,
  resources,
} from "./settings";

const applyDocumentLanguage = (language: string) => {
  if (typeof document === "undefined") return;
  const resolved = resolveLanguage(language);
  document.documentElement.lang = resolved;
  document.documentElement.dir = getLanguageDirection(resolved);
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getStoredLanguage(),
    fallbackLng: fallbackLanguage,
    interpolation: {
      escapeValue: false,
    },
  });

applyDocumentLanguage(i18n.language);
i18n.on("languageChanged", applyDocumentLanguage);

export default i18n;
