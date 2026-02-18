import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import commonId from "./locales/id/common.json";
import commonEn from "./locales/en/common.json";

/**
 * i18n core:
 * - default: id
 * - supported: id, en
 * - fallback: id (safe)
 * - useSuspense: false (avoid React Suspense issues)
 */
void i18n.use(initReactI18next).init({
    resources: {
        id: { common: commonId },
        en: { common: commonEn },
    },
    lng: "id",
    fallbackLng: "id",
    supportedLngs: ["id", "en"],
    ns: ["common"],
    defaultNS: "common",

    // Safety: don't return null/empty for missing keys
    returnNull: false,
    returnEmptyString: false,

    interpolation: {
        escapeValue: false, // React already escapes by default
    },

    react: {
        useSuspense: false,
    },

    // Optional but helpful in dev:
    debug: Boolean(import.meta.env?.DEV),
});

export default i18n;
