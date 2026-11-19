// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Who is calling? Resolves the request to an identity according to AUTH_MODE:
 *  - "access":   Cloudflare Access JWT (the original behavior)
 *  - "password": Better Auth session cookie, or an API key where allowed (MCP)
 */
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createAuth, getAuthMode } from "../auth";
import { verifyApiKey } from "../auth/api-keys";
import type { Env } from "../types";
import { isAuthzEnabled } from "./auth";
import { cookieNames, hasSessionCookie, normalizeCookieHeader } from "./cookies";

export interface Identity {
	/** Lowercased; empty for Access service tokens, which carry no email. */
	email: string;
	userId?: string;
	method: "dev" | "access" | "session" | "api-key";
}

export type IdentityResult = { identity: Identity } | { status: 401 | 403 | 500; message: string };

function getAccessUrls(teamDomain: string) {
	const certsPath = "/cdn-cgi/access/certs";
	const teamUrl = new URL(teamDomain);
	const issuer = teamUrl.origin;
	const certsUrl = teamUrl.pathname.endsWith(certsPath) ? teamUrl : new URL(certsPath, issuer);
	return { issuer, certsUrl };
}

async function resolveAccessIdentity(env: Env, request: Request, dev: boolean): Promise<IdentityResult> {
	if (dev) return { identity: { email: (env.DEV_USER_EMAIL || "dev@localhost").toLowerCase(), method: "dev" } };

	const { POLICY_AUD, TEAM_DOMAIN } = env;
	// Fail closed in production if Access is not configured.
	if (!POLICY_AUD || !TEAM_DOMAIN) {
		return { status: 500, message: "Cloudflare Access must be configured in production. Set POLICY_AUD and TEAM_DOMAIN." };
	}
	const token = request.headers.get("cf-access-jwt-assertion");
	if (!token) return { status: 403, message: "Missing required CF Access JWT" };

	try {
		const { issuer, certsUrl } = getAccessUrls(TEAM_DOMAIN);
		const { payload } = await jwtVerify(token, createRemoteJWKSet(certsUrl), { issuer, audience: POLICY_AUD });
		// Service-token JWTs carry no email claim; they get an empty identity
		// and therefore no mailbox access unless authorization is disabled.
		return { identity: { email: typeof payload.email === "string" ? payload.email.toLowerCase() : "", method: "access" } };
	} catch {
		return { status: 403, message: "Invalid or expired Access token" };
	}
}

function bearerKey(request: Request): string | null {
	const header = request.headers.get("authorization");
	const bearer = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
	return request.headers.get("x-api-key") ?? bearer ?? null;
}

async function resolvePasswordIdentity(env: Env, request: Request, allowApiKey: boolean): Promise<IdentityResult> {
	// Without admins there is nobody who could manage users or grant mailbox access.
	if (!isAuthzEnabled(env)) return { status: 500, message: "AUTH_MODE=password requires ADMIN_EMAILS to be set." };
	if (!env.BETTER_AUTH_SECRET) return { status: 500, message: "AUTH_MODE=password requires the BETTER_AUTH_SECRET secret." };

	if (allowApiKey) {
		const key = bearerKey(request);
		if (key) {
			const found = await verifyApiKey(env.DB, key);
			return found
				? { identity: { email: found.email, userId: found.userId, method: "api-key" } }
				: { status: 401, message: "Invalid API key" };
		}
	}

	const headers = new Headers(request.headers);
	const cookie = normalizeCookieHeader(headers.get("cookie"));
	if (cookie) headers.set("cookie", cookie);

	const session = await createAuth(env, request).api.getSession({ headers });
	if (!session) {
		// Names only, never values: tells "cookie never arrived" apart from "cookie arrived but is not valid".
		const names = cookieNames(cookie);
		console.warn("auth: no valid session", {
			path: new URL(request.url).pathname,
			method: request.method,
			cookieCount: names.length,
			hasSessionCookie: hasSessionCookie(names),
		});
		return { status: 401, message: "Authentication required" };
	}
	return { identity: { email: session.user.email.toLowerCase(), userId: session.user.id, method: "session" } };
}

export async function resolveIdentity(
	env: Env,
	request: Request,
	opts: { dev: boolean; allowApiKey: boolean },
): Promise<IdentityResult> {
	return getAuthMode(env) === "password"
		? resolvePasswordIdentity(env, request, opts.allowApiKey)
		: resolveAccessIdentity(env, request, opts.dev);
}
