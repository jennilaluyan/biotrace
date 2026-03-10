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

const initialLng = readStoredLocale() ?? "en";

try {
    document.documentElement.lang = initialLng;
} catch { }

void i18n.use(initReactI18next).init({
    resources: {
        id: { common: commonId },
        en: { common: commonEn },
    },
    lng: initialLng,
    fallbackLng: "en",
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

i18n.on("languageChanged", (lng) => {
    const next = lng === "id" ? "id" : "en";

    try {
        localStorage.setItem(STORAGE_KEY, next);
    } catch { }

    try {
        document.documentElement.lang = next;
    } catch { }
});

export default i18n;
export { STORAGE_KEY };