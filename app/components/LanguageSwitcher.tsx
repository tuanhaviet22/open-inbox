// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useTranslation } from "react-i18next";
import { useRevalidator } from "react-router";
import { LOCALE_COOKIE, LOCALE_NAMES, matchLocale, SUPPORTED_LOCALES } from "shared/locales";

export default function LanguageSwitcher() {
	const { i18n, t } = useTranslation();
	const revalidator = useRevalidator();

	const onChange = (value: string) => {
		const locale = matchLocale(value);
		if (!locale) return;
		document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
		void i18n.changeLanguage(locale);
		document.documentElement.lang = locale;
		void revalidator.revalidate();
	};

	return (
		<select
			aria-label={t("language")}
			value={matchLocale(i18n.language) ?? "en"}
			onChange={(e) => onChange(e.target.value)}
			className="rounded-md border border-kumo-line bg-kumo-base px-2 py-1 text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-ring"
		>
			{SUPPORTED_LOCALES.map((l) => (
				<option key={l} value={l}>
					{LOCALE_NAMES[l]}
				</option>
			))}
		</select>
	);
}
