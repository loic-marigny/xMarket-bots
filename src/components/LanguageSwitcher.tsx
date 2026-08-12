import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import {
  languageNames,
  languageStorageKey,
  resolveLanguage,
  supportedLanguages,
} from "@/i18n/settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

/**
 * Selects the active UI language from the configured language list.
 */
export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const currentLanguage = resolveLanguage(i18n.language);

  const handleLanguageChange = (newLang: string) => {
    i18n.changeLanguage(newLang);
    localStorage.setItem(languageStorageKey, newLang);
  };

  return (
    <Select value={currentLanguage} onValueChange={handleLanguageChange}>
      <SelectTrigger className="w-[190px] gap-2">
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4" />
          <SelectValue>{languageNames[currentLanguage]}</SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {supportedLanguages.map((language) => (
          <SelectItem key={language} value={language}>
            {languageNames[language]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
