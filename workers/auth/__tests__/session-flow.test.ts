import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { authGuard, type GuardEnv } from "../../lib/guard";
import type { Env } from "../../types";
import { createAuth, createUserWithPassword } from "../index";
import { authApp } from "../routes";
import { fakeD1 } from "./fake-d1";

/**
 * The whole browser flow through the real guard and auth routes: sign in, take
 * the cookies the server sets, and call a protected route with them.
 */
function makeEnv() {
	return {
		AUTH_MODE: "password",
		ADMIN_EMAILS: "contact@sportix.vn",
		BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
		BETTER_AUTH_URL: "https://mailbox.sportix.vn",
		DB: fakeD1(),
	} as unknown as Env;
}

function makeApp() {
	const app = new Hono<GuardEnv>();
	app.use("*", authGuard({ dev: false }));
	app.route("/", authApp);
	app.all("*", (c) => c.json({ ok: true, email: c.get("userEmail"), method: c.get("authMethod") }));
	return app;
}

const cookieHeader = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

async function signedInCookie(app: ReturnType<typeof makeApp>, env: Env) {
	await createUserWithPassword(createAuth(env), { email: "contact@sportix.vn", name: "Contact", password: "correct horse battery" });
	const res = await app.request(
		"https://mailbox.sportix.vn/api/auth/sign-in/email",
		{
			method: "POST",
			headers: { "content-type": "application/json", origin: "https://mailbox.sportix.vn", "cf-connecting-ip": "203.0.113.5" },
			body: JSON.stringify({ email: "contact@sportix.vn", password: "correct horse battery" }),
		},
		env,
	);
	return { res, cookie: cookieHeader(res) };
}

describe("browser session flow", () => {
	it("sets a secure session cookie on sign-in", async () => {
		const env = makeEnv();
		const { res } = await signedInCookie(makeApp(), env);
		expect(res.status).toBe(200);
		const setCookie = res.headers.getSetCookie().join("\n");
		expect(setCookie).toMatch(/__Secure-better-auth\.session_token=/);
		expect(setCookie).toMatch(/Secure/i);
		expect(setCookie).toMatch(/HttpOnly/i);
		expect(setCookie).toMatch(/Path=\//i);
		expect(setCookie).not.toMatch(/Domain=/i);
	});

	it("lets a protected route through with that cookie", async () => {
		const env = makeEnv();
		const app = makeApp();
		const { cookie } = await signedInCookie(app, env);
		const res = await app.request("https://mailbox.sportix.vn/api/v1/me", { headers: { cookie } }, env);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ ok: true, email: "contact@sportix.vn", method: "session" });
	});

	it("serves the home page instead of redirecting to /login", async () => {
		const env = makeEnv();
		const app = makeApp();
		const { cookie } = await signedInCookie(app, env);
		const res = await app.request("https://mailbox.sportix.vn/", { headers: { cookie, accept: "text/html" } }, env);
		expect(res.status).toBe(200);
	});

	it("still redirects to /login without the cookie", async () => {
		const res = await makeApp().request("https://mailbox.sportix.vn/", { headers: { accept: "text/html" } }, makeEnv());
		expect(res.status).toBe(302);
	});
});

describe("HTTP/2 split cookie headers", () => {
	/** HTTP/2 sends one `cookie` header per cookie; Headers.get() then joins them. */
	const withSplitCookies = (cookie: string, extra: string[]) => {
		const headers = new Headers({ accept: "text/html" });
		for (const pair of [...extra, ...cookie.split("; ")]) headers.append("cookie", pair);
		return headers;
	};

	it("still recognizes the session when cookies arrive as separate headers", async () => {
		const env = makeEnv();
		const app = makeApp();
		const { cookie } = await signedInCookie(app, env);
		const headers = withSplitCookies(cookie, ["_ga=GA1.1.123", "_gcl_au=1.1.456", "ph_phc_x_posthog=%7B%22a%22%3A1%7D"]);
		const res = await app.request("https://mailbox.sportix.vn/api/v1/me", { headers }, env);
		expect(res.status).toBe(200);
	});

	it("works when the session cookie is the first of several", async () => {
		const env = makeEnv();
		const app = makeApp();
		const { cookie } = await signedInCookie(app, env);
		const headers = withSplitCookies(cookie, []);
		for (const extra of ["_ga=GA1.1.123", "_bs=abc"]) headers.append("cookie", extra);
		const res = await app.request("https://mailbox.sportix.vn/api/v1/me", { headers }, env);
		expect(res.status).toBe(200);
	});
});
