// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { isAdmin } from "../lib/auth";
import type { Env } from "../types";
import { countUsers, createAuth, createUserWithPassword, getAuthMode, MIN_PASSWORD_LENGTH } from "./index";

export const SetupBodySchema = z.object({
	token: z.string().min(1),
	email: z.string().email(),
	name: z.string().trim().max(100).optional(),
	password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
});

/** Constant-time comparison so the setup token cannot be guessed byte by byte. */
export function safeEqual(a: string, b: string): boolean {
	const enc = new TextEncoder();
	const x = enc.encode(a);
	const y = enc.encode(b);
	let diff = x.length ^ y.length;
	for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
	return diff === 0;
}

/** Public endpoints of AUTH_MODE=password: Better Auth's own routes and the first-admin setup. */
export const authApp = new Hono<{ Bindings: Env }>();

// Scoped to these paths on purpose: a "*" middleware would leak into the parent app when mounted.
const onlyInPasswordMode: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	if (getAuthMode(c.env) !== "password") return c.json({ error: "Not found" }, 404);
	return next();
};
authApp.use("/api/auth/*", onlyInPasswordMode);
authApp.use("/api/setup", onlyInPasswordMode);

authApp.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env, c.req.raw).handler(c.req.raw));

/**
 * One-time creation of the first admin. Requires the SETUP_TOKEN secret, an
 * email listed in ADMIN_EMAILS, and an empty user table.
 */
authApp.post("/api/setup", async (c) => {
	const { SETUP_TOKEN } = c.env;
	if (!SETUP_TOKEN || !c.env.BETTER_AUTH_SECRET) return c.json({ error: "Setup is not enabled" }, 404);

	const body = SetupBodySchema.parse(await c.req.json());
	if (!safeEqual(body.token, SETUP_TOKEN)) return c.json({ error: "Invalid setup token" }, 403);
	if (!isAdmin(c.env, body.email)) return c.json({ error: "Email must be listed in ADMIN_EMAILS" }, 400);

	const auth = createAuth(c.env, c.req.raw);
	if ((await countUsers(auth)) > 0) return c.json({ error: "Setup already completed" }, 409);

	const user = await createUserWithPassword(auth, { email: body.email, name: body.name ?? "", password: body.password });
	if (user === "exists") return c.json({ error: "Setup already completed" }, 409);
	return c.json({ id: user.id, email: user.email }, 201);
});

authApp.onError((err, c) => {
	if (err instanceof z.ZodError) return c.json({ error: "Invalid request", issues: err.issues }, 400);
	console.error("Auth route error:", err.message);
	return c.json({ error: "Internal server error" }, 500);
});
