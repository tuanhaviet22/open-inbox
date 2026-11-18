import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../../../shared/locales";
import { NAMESPACES } from "../index";

const root = join(__dirname, "../../locales");

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
	return Object.entries(obj).flatMap(([k, v]) =>
		v && typeof v === "object" ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
	);
}

/** i18next plural suffixes differ per language (vi has only _other), so compare base keys. */
const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, "");

const load = (lng: string, ns: string) =>
	flatten(JSON.parse(readFileSync(join(root, lng, `${ns}.json`), "utf8")));

describe("locale files", () => {
	it("has a folder for every supported locale", () => {
		const dirs = readdirSync(root).sort();
		expect(dirs).toEqual([...SUPPORTED_LOCALES].sort());
	});

	for (const ns of NAMESPACES) {
		it(`${ns}: every locale has the same keys as English`, () => {
			const en = new Set(load("en", ns).map(base));
			for (const lng of SUPPORTED_LOCALES) {
				expect(new Set(load(lng, ns).map(base)), `${lng}/${ns}`).toEqual(en);
			}
		});
	}
});
