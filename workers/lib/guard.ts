// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { MiddlewareHandler } from "hono";
import { getAuthMode, getBaseUrl } from "../auth";
import type { Env } from "../types";
import { type Identity, resolveIdentity } from "./identity";

export type GuardEnv = {
	Bindings: Env;
	Variables: { userEmail: string; userId?: string; authMethod: Identity["method"] };
};

/** Reachable without a session in password mode: auth endpoints, setup, the login page. */
function isPublicInPasswordMode(method: string, path: string): boolean {
	return (
		path.startsWith("/api/auth/") ||
		path === "/api/setup" ||
		path === "/__manifest" ||
		((method === "GET" || method === "HEAD") &&
			(path === "/login" || path === "/login.data" || path === "/reset-password" || path === "/reset-password.data"))
	);
}

/** Calls that expect JSON/WebSocket rather than an HTML page. */
function isApiLike(path: string): boolean {
	return path.startsWith("/api/") || path.startsWith("/agents/") || path === "/mcp" || path.startsWith("/mcp/") || path.endsWith(".data");
}

const isMcp = (path: string) => path === "/mcp" || path.startsWith("/mcp/");
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cookie sessions are sent automatically by browsers, so state-changing requests
 * must come from our own origin. Clients without an Origin header (curl, MCP
 * clients) cannot ride on a victim's cookie, so they are not affected.
 */
export function isCrossSiteWrite(request: Request, allowedOrigin: string): boolean {
	if (SAFE_METHODS.has(request.method)) return false;
	const origin = request.headers.get("origin");
	if (origin && origin !== allowedOrigin) return true;
	return request.headers.get("sec-fetch-site") === "cross-site";
}

export function authGuard(opts: { dev: boolean }): MiddlewareHandler<GuardEnv> {
	return async (c, next) => {
		const path = c.req.path;
		const password = getAuthMode(c.env) === "password";

		if (password) {
			if (isPublicInPasswordMode(c.req.method, path)) return next();
			const authHeader = c.req.header("authorization") ?? c.req.header("x-api-key");
			if (!(isMcp(path) && authHeader) && isCrossSiteWrite(c.req.raw, getBaseUrl(c.env, c.req.raw))) {
				return c.json({ error: "Cross-site request blocked" }, 403);
			}
		}

		const result = await resolveIdentity(c.env, c.req.raw, { dev: opts.dev, allowApiKey: isMcp(path) });
		if ("status" in result) {
			if (!password) return c.text(result.message, result.status);
			if (!isApiLike(path) && c.req.method === "GET") return c.redirect("/login");
			return c.json({ error: result.message }, result.status);
		}

		c.set("userEmail", result.identity.email);
		c.set("authMethod", result.identity.method);
		if (result.identity.userId) c.set("userId", result.identity.userId);
		return next();
	};
}
