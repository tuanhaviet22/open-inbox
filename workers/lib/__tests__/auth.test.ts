import { describe, expect, it } from "vitest";
import { hasRole, isAdmin, isAuthzEnabled, parseEmailList } from "../auth";

describe("auth helpers", () => {
	it("parses comma separated emails", () => {
		expect(parseEmailList(" A@x.com, b@x.com ,,")).toEqual(["a@x.com", "b@x.com"]);
		expect(parseEmailList(undefined)).toEqual([]);
	});

	it("enables authorization only when admins are configured", () => {
		expect(isAuthzEnabled({ ADMIN_EMAILS: "" })).toBe(false);
		expect(isAuthzEnabled({ ADMIN_EMAILS: "a@x.com" })).toBe(true);
	});

	it("matches admins case-insensitively", () => {
		expect(isAdmin({ ADMIN_EMAILS: "Boss@x.com" }, "boss@X.com")).toBe(true);
		expect(isAdmin({ ADMIN_EMAILS: "boss@x.com" }, "other@x.com")).toBe(false);
	});

	it("ranks roles admin > owner > member", () => {
		expect(hasRole("admin", "owner")).toBe(true);
		expect(hasRole("owner", "owner")).toBe(true);
		expect(hasRole("member", "owner")).toBe(false);
		expect(hasRole("member", "member")).toBe(true);
		expect(hasRole(null, "member")).toBe(false);
	});
});
