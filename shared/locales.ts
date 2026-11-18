// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Supported UI / email locales. To add a language: append it here, add a
 * `app/locales/<code>/` folder with one JSON file per namespace (a test checks
 * the key sets match English), and add its strings to `shared/mail-strings.ts`.
 */
export const SUPPORTED_LOCALES = ["en", "vi"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Native display names, shown in the language switcher. */
export const LOCALE_NAMES: Record<Locale, string> = {
	en: "English",
	vi: "Tiếng Việt",
};

export const LOCALE_COOKIE = "lang";

/** Map a BCP-47 tag such as "vi-VN" to a supported locale, or null. */
export function matchLocale(tag: string | null | undefined): Locale | null {
	if (!tag) return null;
	const base = tag.trim().toLowerCase().split(/[-_]/)[0];
	return (SUPPORTED_LOCALES as readonly string[]).includes(base) ? (base as Locale) : null;
}

/** Pick the best supported locale from an Accept-Language header. */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
	if (!header) return null;
	const ranked = header
		.split(",")
		.map((part, index) => {
			const [tag, ...params] = part.trim().split(";");
			const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
			return { tag, q: q ? Number(q.slice(2)) : 1, index };
		})
		.filter((r) => r.tag && !Number.isNaN(r.q) && r.q > 0)
		.sort((a, b) => b.q - a.q || a.index - b.index);
	for (const { tag } of ranked) {
		const m = matchLocale(tag);
		if (m) return m;
	}
	return null;
}

export function readLocaleCookie(cookieHeader: string | null | undefined): Locale | null {
	if (!cookieHeader) return null;
	for (const part of cookieHeader.split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (name === LOCALE_COOKIE) return matchLocale(decodeURIComponent(rest.join("=")));
	}
	return null;
}

/** Cookie first (explicit user choice), then Accept-Language, then default. */
export function resolveLocale(cookieHeader?: string | null, acceptLanguage?: string | null): Locale {
	return readLocaleCookie(cookieHeader) ?? matchAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}
