import { describe, expect, it } from "vitest";
import { cookieNames, hasSessionCookie, normalizeCookieHeader, summarizeSetCookie } from "../cookies";

describe("normalizeCookieHeader", () => {
	it("leaves a well-formed header alone", () => {
		expect(normalizeCookieHeader("a=1; b=2")).toBe("a=1; b=2");
		expect(normalizeCookieHeader(null)).toBeNull();
	});

	it("repairs cookies joined with a comma", () => {
		expect(normalizeCookieHeader("_ga=GA1.1.1, _bs=x, __Secure-better-auth.session_token=tok.sig")).toBe(
			"_ga=GA1.1.1; _bs=x; __Secure-better-auth.session_token=tok.sig",
		);
	});

	it("does not touch encoded commas inside values", () => {
		expect(normalizeCookieHeader("p=%7B%22a%22%3A1%2C%22b%22%3A2%7D; q=1")).toBe("p=%7B%22a%22%3A1%2C%22b%22%3A2%7D; q=1");
	});
});

describe("cookieNames / hasSessionCookie", () => {
	it("lists names without values", () => {
		const names = cookieNames("_ga=secret; __Secure-better-auth.session_token=tok.sig");
		expect(names).toEqual(["_ga", "__Secure-better-auth.session_token"]);
		expect(hasSessionCookie(names)).toBe(true);
		expect(hasSessionCookie(["_ga"])).toBe(false);
	});

	it("finds the session cookie even when the header was joined with commas", () => {
		expect(hasSessionCookie(cookieNames("_ga=1, __Secure-better-auth.session_token=a.b"))).toBe(true);
	});
});

describe("summarizeSetCookie", () => {
	it("keeps the name and attributes but drops the value", () => {
		const s = summarizeSetCookie("__Secure-better-auth.session_token=tok.sig; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 26 Nov 2026 00:00:00 GMT");
		expect(s).not.toContain("tok.sig");
		expect(s).toContain("__Secure-better-auth.session_token");
		expect(s).toContain("Secure");
		expect(s).toContain("SameSite=Lax");
	});
});
