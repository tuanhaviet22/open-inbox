import { beforeEach, describe, expect, it, vi } from "vitest";

const countUsers = vi.fn();
const createUserWithPassword = vi.fn();

vi.mock("../index", async (importOriginal) => ({
	...(await importOriginal<typeof import("../index")>()),
	createAuth: () => ({ handler: () => new Response("auth-handler") }),
	countUsers: () => countUsers(),
	createUserWithPassword: (...a: unknown[]) => createUserWithPassword(...a),
}));

import { authApp, safeEqual } from "../routes";

const env = {
	AUTH_MODE: "password",
	ADMIN_EMAILS: "boss@example.com",
	BETTER_AUTH_SECRET: "s".repeat(32),
	SETUP_TOKEN: "tok-123",
};
const body = { token: "tok-123", email: "boss@example.com", password: "a-long-password" };
const setup = (b: unknown, e: Record<string, unknown> = env) =>
	authApp.request("/api/setup", { method: "POST", body: JSON.stringify(b), headers: { "content-type": "application/json" } }, e);

beforeEach(() => {
	countUsers.mockReset().mockResolvedValue(0);
	createUserWithPassword.mockReset().mockResolvedValue({ id: "u1", email: "boss@example.com", name: "boss@example.com" });
});

describe("/api/setup", () => {
	it("creates the first admin", async () => {
		const res = await setup(body);
		expect(res.status).toBe(201);
		expect(createUserWithPassword).toHaveBeenCalledOnce();
	});

	it("is hidden unless SETUP_TOKEN is configured", async () => {
		expect((await setup(body, { ...env, SETUP_TOKEN: undefined })).status).toBe(404);
	});

	it("rejects a wrong token", async () => {
		expect((await setup({ ...body, token: "nope" })).status).toBe(403);
		expect(createUserWithPassword).not.toHaveBeenCalled();
	});

	it("requires the email to be an admin", async () => {
		expect((await setup({ ...body, email: "other@example.com" })).status).toBe(400);
	});

	it("refuses once a user exists", async () => {
		countUsers.mockResolvedValue(1);
		expect((await setup(body)).status).toBe(409);
		expect(createUserWithPassword).not.toHaveBeenCalled();
	});

	it("enforces the minimum password length", async () => {
		expect((await setup({ ...body, password: "short" })).status).toBe(400);
	});
});

describe("mode gating", () => {
	it("returns 404 for auth routes in access mode", async () => {
		const res = await authApp.request("/api/auth/sign-in/email", { method: "POST" }, { ...env, AUTH_MODE: "access" });
		expect(res.status).toBe(404);
	});

	it("does not intercept other paths", async () => {
		const res = await authApp.request("/api/v1/me", {}, { ...env, AUTH_MODE: "access" });
		expect(res.status).toBe(404); // no route here, not our JSON 404
		expect(await res.text()).toBe("404 Not Found");
	});

	it("forwards /api/auth/* to Better Auth in password mode", async () => {
		const res = await authApp.request("/api/auth/get-session", {}, env);
		expect(await res.text()).toBe("auth-handler");
	});
});

describe("safeEqual", () => {
	it("compares by value and length", () => {
		expect(safeEqual("abc", "abc")).toBe(true);
		expect(safeEqual("abc", "abd")).toBe(false);
		expect(safeEqual("abc", "abcd")).toBe(false);
	});
});
