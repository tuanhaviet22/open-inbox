import { describe, expect, it } from "vitest";
import { formatQuotedDate } from "../dates";
import { matchAcceptLanguage, matchLocale, resolveLocale } from "../locales";
import { formatQuotedHeader, getMailStrings } from "../mail-strings";

describe("locale matching", () => {
	it("maps regional tags to a supported locale", () => {
		expect(matchLocale("vi-VN")).toBe("vi");
		expect(matchLocale("EN_us")).toBe("en");
		expect(matchLocale("fr")).toBeNull();
	});

	it("honours q-values in Accept-Language", () => {
		expect(matchAcceptLanguage("fr;q=0.9, vi;q=0.8, en;q=0.1")).toBe("vi");
		expect(matchAcceptLanguage("en;q=0.2, vi;q=0.9")).toBe("vi");
		expect(matchAcceptLanguage("de, fr")).toBeNull();
	});

	it("prefers the cookie over Accept-Language, then falls back to English", () => {
		expect(resolveLocale("a=b; lang=vi", "en")).toBe("vi");
		expect(resolveLocale(null, "vi-VN,vi;q=0.9")).toBe("vi");
		expect(resolveLocale(null, null)).toBe("en");
		expect(resolveLocale("lang=xx", null)).toBe("en");
	});
});

describe("mail strings", () => {
	it("builds a quoted header per locale", () => {
		expect(formatQuotedHeader("en", "Apr 15", "a@x.com")).toBe("On Apr 15, a@x.com wrote:");
		expect(formatQuotedHeader("vi", "15 thg 4", "a@x.com")).toBe("Vào 15 thg 4, a@x.com đã viết:");
	});

	it("falls back to English for unknown locales", () => {
		expect(getMailStrings("zz").replyPrefix).toBe("Re:");
	});

	it("does not interpret $ sequences in the sender", () => {
		expect(formatQuotedHeader("en", "d", "$&x")).toBe("On d, $&x wrote:");
	});
});

describe("formatQuotedDate", () => {
	it("is deterministic per locale", () => {
		const iso = "2026-04-15T15:42:00Z";
		expect(formatQuotedDate(iso, "en")).toMatch(/2026/);
		expect(formatQuotedDate(iso, "vi")).not.toBe(formatQuotedDate(iso, "en"));
	});
});
