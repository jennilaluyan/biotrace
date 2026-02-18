// frontend/src/i18n/index.ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import commonId from "./locales/id/common.json";
import commonEn from "./locales/en/common.json";

const STORAGE_KEY = "biotrace_locale";

function readStoredLocale(): "id" | "en" | null {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === "id" || v === "en") return v;
        return null;
    } catch {
        return null;
    }
}

const initialLng = readStoredLocale() ?? "id";

// Set <html lang="..."> for accessibility/SEO
try {
    document.documentElement.lang = initialLng;
} catch { }

void i18n.use(initReactI18next).init({
    resources: {
        id: { common: commonId },
        en: { common: commonEn },
    },
    lng: initialLng,
    fallbackLng: "id",
    supportedLngs: ["id", "en"],
    ns: ["common"],
    defaultNS: "common",

    returnNull: false,
    returnEmptyString: false,

    interpolation: {
        escapeValue: false,
    },

    react: {
        useSuspense: false,
    },

    debug: Boolean(import.meta.env?.DEV),
});

export default i18n;

// Export key biar bisa dipakai Topbar (optional, tapi rapi)
export { STORAGE_KEY };
