// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Built-in email + password authentication (AUTH_MODE=password), backed by
 * Better Auth on Cloudflare D1. Self-service sign-up is disabled: users are
 * created by an admin (or by the one-time /api/setup call for the first admin).
 */
import { betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import { getEmailProvider } from "../email-sender";
import type { Env } from "../types";

export type AuthMode = "access" | "password";

/** Anything but an explicit "password" keeps the Cloudflare Access behavior. */
export function getAuthMode(env: { AUTH_MODE?: string }): AuthMode {
	return env.AUTH_MODE === "password" ? "password" : "access";
}

export { MIN_PASSWORD_LENGTH } from "./constants";
import { MIN_PASSWORD_LENGTH } from "./constants";

/** Public URL of the app. Falls back to the request origin when BETTER_AUTH_URL is unset. */
export function getBaseUrl(env: { BETTER_AUTH_URL?: string }, request?: Request): string {
	const configured = env.BETTER_AUTH_URL?.trim();
	if (configured) return new URL(configured).origin;
	if (request) return new URL(request.url).origin;
	throw new Error("BETTER_AUTH_URL is required");
}

function resetMailSender(env: Env): string | null {
	if (env.AUTH_FROM_ADDRESS) return env.AUTH_FROM_ADDRESS;
	const domain = (env.DOMAINS || "").split(",")[0]?.trim();
	return domain ? `no-reply@${domain}` : null;
}

export function createAuth(env: Env, request?: Request) {
	if (!env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET must be set when AUTH_MODE=password");
	const baseURL = getBaseUrl(env, request);

	return betterAuth({
		appName: "Open Inbox",
		baseURL,
		secret: env.BETTER_AUTH_SECRET,
		trustedOrigins: [baseURL],
		database: { dialect: new D1Dialect({ database: env.DB }), type: "sqlite" },
		emailAndPassword: {
			enabled: true,
			disableSignUp: true,
			minPasswordLength: MIN_PASSWORD_LENGTH,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user, url }) => {
				const from = resetMailSender(env);
				if (!from) {
					console.error("Password reset requested but no sender address is configured (set DOMAINS or AUTH_FROM_ADDRESS)");
					return;
				}
				await getEmailProvider(env).send({
					to: user.email,
					from,
					subject: "Reset your Open Inbox password",
					text: `Use this link to choose a new password:\n\n${url}\n\nIf you did not ask for this, ignore this email.`,
				});
			},
		},
		// The default in-memory limiter is per isolate and so does nothing useful on
		// Workers; counters live in D1 instead.
		rateLimit: {
			enabled: true,
			storage: "database",
			window: 60,
			max: 100,
			customRules: {
				"/sign-in/email": { window: 60, max: 5 },
				"/request-password-reset": { window: 300, max: 3 },
				"/reset-password": { window: 300, max: 5 },
			},
		},
		advanced: {
			// Workers do not set X-Forwarded-For; without this every client shares one bucket.
			ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
			useSecureCookies: baseURL.startsWith("https://"),
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;

export async function countUsers(auth: Auth): Promise<number> {
	return (await auth.$context).internalAdapter.countTotalUsers();
}

/** Create a user with a credential account (sign-up is disabled, so go through the adapter). */
export async function createUserWithPassword(
	auth: Auth,
	input: { email: string; name: string; password: string },
): Promise<{ id: string; email: string; name: string } | "exists"> {
	const ctx = await auth.$context;
	const email = input.email.trim().toLowerCase();
	if (await ctx.internalAdapter.findUserByEmail(email)) return "exists";
	const user = await ctx.internalAdapter.createUser({ email, name: input.name.trim() || email, emailVerified: true }, { method: "admin" });
	await ctx.internalAdapter.linkAccount({
		userId: user.id,
		providerId: "credential",
		accountId: user.id,
		password: await ctx.password.hash(input.password),
	});
	return { id: user.id, email: user.email, name: user.name };
}

export async function listUsers(auth: Auth) {
	const users = await (await auth.$context).internalAdapter.listUsers(200, 0);
	return users.map((u) => ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt }));
}

export async function deleteUser(auth: Auth, userId: string) {
	await (await auth.$context).internalAdapter.deleteUser(userId);
}

/** Set a new password and sign the user out everywhere. */
export async function setUserPassword(auth: Auth, userId: string, password: string) {
	const ctx = await auth.$context;
	await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(password));
	const sessions = await ctx.internalAdapter.listSessions(userId);
	await ctx.internalAdapter.deleteSessions(sessions.map((s) => s.token));
}
