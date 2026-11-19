import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS, securityHeaders } from "../security-headers";

const makeApp = () => {
	const app = new Hono();
	app.use("*", securityHeaders());
	app.get("/json", (c) => c.json({ ok: true }));
	app.get("/page", (c) => c.html("<h1>hi</h1>"));
	app.get("/redirect", () => Response.redirect("https://mail.example.com/login", 302)); // immutable headers
	app.get("/custom", (c) => {
		c.header("X-Frame-Options", "SAMEORIGIN");
		return c.text("x");
	});
	app.get("/ws", () => new Response(null, { status: 200, headers: { upgrade: "websocket" } }));
	return app;
};

const get = (path: string, init: RequestInit = {}, url = "https://mail.example.com") => makeApp().request(`${url}${path}`, init);

describe("securityHeaders", () => {
	it("adds the hardening headers to JSON and HTML responses", async () => {
		for (const path of ["/json", "/page"]) {
			const res = await get(path);
			expect(res.headers.get("x-content-type-options")).toBe("nosniff");
			expect(res.headers.get("x-frame-options")).toBe("DENY");
			expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
			expect(res.headers.get("strict-transport-security")).toMatch(/max-age=31536000/);
			expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
			expect(res.headers.get("content-security-policy-report-only")).toContain("default-src 'self'");
		}
	});

	it("also covers redirects, whose headers are immutable", async () => {
		const res = await get("/redirect");
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("https://mail.example.com/login");
		expect(res.headers.get("x-frame-options")).toBe("DENY");
	});

	it("keeps a header the route set itself", async () => {
		expect((await get("/custom")).headers.get("x-frame-options")).toBe("SAMEORIGIN");
	});

	it("sends HSTS only over https", async () => {
		expect((await get("/json", {}, "http://localhost:8787")).headers.get("strict-transport-security")).toBeNull();
	});

	it("leaves WebSocket upgrades alone", async () => {
		const res = await get("/ws", { headers: { upgrade: "websocket" } });
		expect(res.headers.get("x-frame-options")).toBeNull();
	});

	it("does not enforce a script policy yet (report-only)", () => {
		expect(SECURITY_HEADERS["Content-Security-Policy"]).not.toMatch(/script-src|default-src/);
	});
});
