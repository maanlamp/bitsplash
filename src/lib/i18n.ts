import { enGB, nl } from "date-fns/locale";
import i18n from "i18next";
import Backend from "i18next-http-backend";
import { initReactI18next, useTranslation } from "react-i18next";

/** Here you need to couple any locales, such as for `date-fns`,
 * to the appropriate language code so that the rest of the app can use it.
 */
const locales: Record<string, Locale> = {
	en: enGB,
	nl,
};

export const useLocale = () => {
	const { i18n } = useTranslation();
	return {
		locales,
		locale: locales[i18n.resolvedLanguage as keyof typeof locales],
	};
};

/** The language code for the locale that will be used if your user
 * has not specified a locale (yet).
 */
export const fallbackLng: keyof typeof locales = "nl";

// ⚠️ NOTE: i18n is poorly designed, so it needs to run a couple of side effects
// which happens when you import this file.
// Make sure it is imported ***AT MOST ONCE***, such as in your `index.tsx`.
i18n
	.use(
		new Backend(null, {
			loadPath: (languages, namespaces) => `/i18n/${languages}.json`,
		})
	)
	.use(initReactI18next)
	.init({ supportedLngs: Object.keys(locales), fallbackLng });

export default i18n;
