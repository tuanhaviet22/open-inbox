import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const verifyApiKey = vi.fn();

vi.mock("../../auth", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../auth")>()),
	createAuth: () => ({ api: { getSession } }),
}));
vi.mock("../../auth/api-keys", () => ({ verifyApiKey: (...a: unknown[]) => verifyApiKey(...a) }));

import { authGuard, type GuardEnv, isCrossSiteWrite } from "../guard";

const baseEnv = {
	AUTH_MODE: "password",
	ADMIN_EMAILS: "boss@example.com",
	BETTER_AUTH_SECRET: "s".repeat(32),
	BETTER_AUTH_URL: "https://mail.test",
	DB: {},
};

function makeApp(dev = false) {
	const app = new Hono<GuardEnv>();
	app.use("*", authGuard({ dev }));
	app.all("*", (c) => c.json({ ok: true, email: c.get("userEmail"), method: c.get("authMethod") }));
	return app;
}

const call = (app: ReturnType<typeof makeApp>, path: string, init: RequestInit = {}, env: Record<string, unknown> = baseEnv) =>
	app.request(`https://mail.test${path}`, init, env);

beforeEach(() => {
	getSession.mockReset().mockResolvedValue(null);
	verifyApiKey.mockReset().mockResolvedValue(null);
});

describe("authGuard in password mode", () => {
	it.each(["/api/v1/me", "/api/v1/mailboxes", "/agents/email-agent/a@x.com", "/mcp", "/_root.data"])(
		"returns 401 JSON for %s without a session",
		async (path) => {
			const res = await call(makeApp(), path);
			expect(res.status).toBe(401);
			expect(await res.json()).toEqual({ error: "Authentication required" });
		},
	);

	it("redirects page navigations to /login", async () => {
		const res = await call(makeApp(), "/mailbox/a@x.com/emails/inbox");
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/login");
	});

	it("keeps the login page, auth endpoints and setup public", async () => {
		const app = makeApp();
		expect((await call(app, "/login")).status).toBe(200);
		expect((await call(app, "/api/auth/sign-in/email", { method: "POST" })).status).toBe(200);
		expect((await call(app, "/api/setup", { method: "POST" })).status).toBe(200);
		expect(getSession).not.toHaveBeenCalled();
	});

	it("only the login page GET is public, not other methods", async () => {
		expect((await call(makeApp(), "/login", { method: "DELETE" })).status).toBe(401);
	});

	it("lets a valid session through and exposes the identity", async () => {
		getSession.mockResolvedValue({ user: { id: "u1", email: "Me@Example.com" } });
		const res = await call(makeApp(), "/api/v1/me");
		expect(await res.json()).toEqual({ ok: true, email: "me@example.com", method: "session" });
	});

	it("accepts API keys on /mcp only", async () => {
		verifyApiKey.mockResolvedValue({ userId: "u1", email: "me@example.com" });
		const app = makeApp();
		const headers = { authorization: "Bearer oik_abc" };
		expect((await call(app, "/mcp", { headers })).status).toBe(200);
		expect((await call(app, "/api/v1/mailboxes", { headers })).status).toBe(401);
	});

	it("rejects an invalid API key on /mcp", async () => {
		const res = await call(makeApp(), "/mcp", { headers: { "x-api-key": "oik_nope" } });
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Invalid API key" });
	});

	it("blocks cross-site writes even with a valid session", async () => {
		getSession.mockResolvedValue({ user: { id: "u1", email: "me@example.com" } });
		const app = makeApp();
		const bad = await call(app, "/api/v1/mailboxes", { method: "POST", headers: { origin: "https://evil.test" } });
		expect(bad.status).toBe(403);
		const good = await call(app, "/api/v1/mailboxes", { method: "POST", headers: { origin: "https://mail.test" } });
		expect(good.status).toBe(200);
	});

	it("fails closed without ADMIN_EMAILS or the auth secret", async () => {
		expect((await call(makeApp(), "/api/v1/me", {}, { ...baseEnv, ADMIN_EMAILS: "" })).status).toBe(500);
		expect((await call(makeApp(), "/api/v1/me", {}, { ...baseEnv, BETTER_AUTH_SECRET: undefined })).status).toBe(500);
	});
});

describe("authGuard in access mode", () => {
	const accessEnv = { AUTH_MODE: "access", DB: {} };

	it("keeps the dev bypass", async () => {
		const res = await call(makeApp(true), "/api/v1/me", {}, { ...accessEnv, DEV_USER_EMAIL: "Dev@X.com" });
		expect(await res.json()).toEqual({ ok: true, email: "dev@x.com", method: "dev" });
	});

	it("fails closed in production without Access config", async () => {
		expect((await call(makeApp(), "/api/v1/me", {}, accessEnv)).status).toBe(500);
	});

	it("rejects a missing Access JWT", async () => {
		const res = await call(makeApp(), "/", {}, { ...accessEnv, POLICY_AUD: "aud", TEAM_DOMAIN: "https://team.cloudflareaccess.com" });
		expect(res.status).toBe(403);
	});

	it("treats an unknown AUTH_MODE as access", async () => {
		expect((await call(makeApp(), "/api/v1/me", {}, { AUTH_MODE: "weird", DB: {} })).status).toBe(500);
	});
});

describe("isCrossSiteWrite", () => {
	const req = (method: string, headers: Record<string, string> = {}) => new Request("https://mail.test/api", { method, headers });

	it("never blocks safe methods", () => {
		expect(isCrossSiteWrite(req("GET", { origin: "https://evil.test" }), "https://mail.test")).toBe(false);
	});

	it("blocks writes from another origin or marked cross-site", () => {
		expect(isCrossSiteWrite(req("POST", { origin: "https://evil.test" }), "https://mail.test")).toBe(true);
		expect(isCrossSiteWrite(req("DELETE", { "sec-fetch-site": "cross-site" }), "https://mail.test")).toBe(true);
	});

	it("allows same-origin and header-less clients", () => {
		expect(isCrossSiteWrite(req("POST", { origin: "https://mail.test" }), "https://mail.test")).toBe(false);
		expect(isCrossSiteWrite(req("POST"), "https://mail.test")).toBe(false);
	});
});
