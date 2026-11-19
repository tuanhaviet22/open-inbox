import { describe, expect, it } from "vitest";
import type { Env } from "../../types";
import { fakeD1 } from "./fake-d1";
import { countUsers, createAuth, createUserWithPassword, deleteUser, listUsers, setUserPassword } from "../index";

const env = () =>
	({
		AUTH_MODE: "password",
		ADMIN_EMAILS: "boss@example.com",
		BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
		BETTER_AUTH_URL: "https://mail.test",
		DB: fakeD1(),
	}) as unknown as Env;

const signIn = (auth: ReturnType<typeof createAuth>, email: string, password: string) =>
	auth.handler(
		new Request("https://mail.test/api/auth/sign-in/email", {
			method: "POST",
			headers: { "content-type": "application/json", origin: "https://mail.test", "cf-connecting-ip": "1.2.3.4" },
			body: JSON.stringify({ email, password }),
		}),
	);

describe("Better Auth on the D1 schema", () => {
	it("creates a user, signs in and resolves the session", async () => {
		const e = env();
		const auth = createAuth(e);
		expect(await countUsers(auth)).toBe(0);
		const user = await createUserWithPassword(auth, { email: "Boss@Example.com", name: "Boss", password: "correct horse battery" });
		expect(user).toMatchObject({ email: "boss@example.com" });
		expect(await countUsers(auth)).toBe(1);

		const res = await signIn(auth, "boss@example.com", "correct horse battery");
		expect(res.status).toBe(200);
		const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
		expect(cookie).toContain("session_token");

		const session = await createAuth(e).api.getSession({ headers: new Headers({ cookie }) });
		expect(session?.user.email).toBe("boss@example.com");
	});

	it("rejects a wrong password", async () => {
		const auth = createAuth(env());
		await createUserWithPassword(auth, { email: "a@example.com", name: "A", password: "correct horse battery" });
		expect((await signIn(auth, "a@example.com", "wrong password!!")).status).toBe(401);
	});

	it("does not allow self-service sign-up", async () => {
		const auth = createAuth(env());
		const res = await auth.handler(
			new Request("https://mail.test/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json", origin: "https://mail.test" },
				body: JSON.stringify({ email: "x@example.com", password: "correct horse battery", name: "X" }),
			}),
		);
		expect(res.status).toBe(400);
		expect(await countUsers(auth)).toBe(0);
	});

	it("refuses duplicate emails", async () => {
		const auth = createAuth(env());
		const input = { email: "a@example.com", name: "A", password: "correct horse battery" };
		await createUserWithPassword(auth, input);
		expect(await createUserWithPassword(auth, input)).toBe("exists");
	});

	it("rate limits repeated failed sign-ins", async () => {
		const auth = createAuth(env());
		await createUserWithPassword(auth, { email: "a@example.com", name: "A", password: "correct horse battery" });
		const statuses: number[] = [];
		for (let i = 0; i < 8; i++) statuses.push((await signIn(auth, "a@example.com", "wrong password!!")).status);
		expect(statuses).toContain(429);
	});

	it("changes a password and signs the user out everywhere", async () => {
		const e = env();
		const auth = createAuth(e);
		const user = await createUserWithPassword(auth, { email: "a@example.com", name: "A", password: "correct horse battery" });
		if (user === "exists") throw new Error("unexpected");
		const first = await signIn(auth, "a@example.com", "correct horse battery");
		const cookie = first.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

		await setUserPassword(auth, user.id, "a brand new password");
		expect(await createAuth(e).api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
		expect((await signIn(auth, "a@example.com", "correct horse battery")).status).toBe(401);
		expect((await signIn(createAuth(e), "a@example.com", "a brand new password")).status).toBe(200);
	});

	it("lists and deletes users", async () => {
		const auth = createAuth(env());
		const u = await createUserWithPassword(auth, { email: "a@example.com", name: "A", password: "correct horse battery" });
		if (u === "exists") throw new Error("unexpected");
		expect((await listUsers(auth)).map((x) => x.email)).toEqual(["a@example.com"]);
		await deleteUser(auth, u.id);
		expect(await listUsers(auth)).toEqual([]);
	});
});
