// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { createInstance, type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LOCALE, type Locale } from "shared/locales";

/** Namespaces map 1:1 to `app/locales/<lng>/<ns>.json`. */
export const NAMESPACES = ["common", "mailbox", "compose", "settings", "agent"] as const;
export type Namespace = (typeof NAMESPACES)[number];

// Every `app/locales/<lng>/<ns>.json` is picked up automatically; adding a
// language needs no change here (only `shared/locales.ts`).
const modules = import.meta.glob<{ default: Record<string, unknown> }>("../locales/*/*.json", { eager: true });

export const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, mod] of Object.entries(modules)) {
	const [, lng, file] = path.match(/locales\/([^/]+)\/([^/]+)\.json$/) ?? [];
	if (!lng || !file) continue;
	(resources[lng] ??= {})[file] = mod.default;
}

/**
 * A new instance per render context: the server must never share language
 * state between requests, and the browser keeps one for its lifetime.
 */
export function createI18n(lng: Locale): I18n {
	const instance = createInstance();
	instance.use(initReactI18next).init({
		lng,
		fallbackLng: DEFAULT_LOCALE,
		ns: [...NAMESPACES],
		defaultNS: "common",
		resources,
		interpolation: { escapeValue: false }, // React already escapes
		initAsync: false,
		returnNull: false,
	});
	return instance;
}
