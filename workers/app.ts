// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { routeAgentRequest } from "agents";
import { Hono, type Context } from "hono";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { createRequestHandler } from "react-router";
import { app as apiApp, receiveEmail } from "./index";
import { EmailMCP } from "./mcp";
import { getMailboxRole, hasRole } from "./lib/auth";
import { normalizeMailboxId } from "./lib/mailbox";
import type { Env } from "./types";

export { MailboxDO } from "./durableObject";
export { EmailAgent } from "./agent";
export { EmailMCP } from "./mcp";
export { AccessDO } from "./access";

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

function getAccessUrls(teamDomain: string) {
	const certsPath = "/cdn-cgi/access/certs";
	const teamUrl = new URL(teamDomain);
	const issuer = teamUrl.origin;
	const certsUrl = teamUrl.pathname.endsWith(certsPath)
		? teamUrl
		: new URL(certsPath, issuer);

	return { issuer, certsUrl };
}

// Main app that wraps the API and adds React Router fallback
type AppEnv = { Bindings: Env; Variables: { userEmail: string } };
const app = new Hono<AppEnv>();

// Cloudflare Access JWT validation middleware (production only)
app.use("*", async (c, next) => {
	// Skip validation in development
	if (import.meta.env.DEV) {
		c.set("userEmail", (c.env.DEV_USER_EMAIL || "dev@localhost").toLowerCase());
		return next();
	}

	const { POLICY_AUD, TEAM_DOMAIN } = c.env;

	// Fail closed in production if Access is not configured.
	if (!POLICY_AUD || !TEAM_DOMAIN) {
		return c.text(
			"Cloudflare Access must be configured in production. Set POLICY_AUD and TEAM_DOMAIN.",
			500,
		);
	}

	const token = c.req.header("cf-access-jwt-assertion");
	if (!token) {
		return c.text("Missing required CF Access JWT", 403);
	}

	try {
		const { issuer, certsUrl } = getAccessUrls(TEAM_DOMAIN);
		const JWKS = createRemoteJWKSet(certsUrl);
		const { payload } = await jwtVerify(token, JWKS, {
			issuer,
			audience: POLICY_AUD,
		});
		// Service-token JWTs carry no email claim; they get an empty identity
		// and therefore no mailbox access unless authorization is disabled.
		c.set("userEmail", typeof payload.email === "string" ? payload.email.toLowerCase() : "");
	} catch {
		return c.text("Invalid or expired Access token", 403);
	}

	// Per-mailbox authorization is enforced by requireMailbox (API), the
	// /agents/* guard and the MCP server whenever ADMIN_EMAILS is set.
	return next();
});

// MCP server endpoint — used by AI coding tools (ProtoAgent, Claude Code, Cursor, etc.)
// Must be before API routes and React Router catch-all
const mcpHandler = EmailMCP.serve("/mcp", { binding: "EMAIL_MCP" });
// The caller's identity is handed to the MCP agent as `props`.
const mcpContext = (c: Context<AppEnv>) => {
	const ctx = c.executionCtx;
	return {
		waitUntil: ctx.waitUntil.bind(ctx),
		passThroughOnException: ctx.passThroughOnException.bind(ctx),
		props: { userEmail: c.get("userEmail") },
	} as unknown as ExecutionContext;
};
app.all("/mcp", async (c) => mcpHandler.fetch(c.req.raw, c.env, mcpContext(c)));
app.all("/mcp/*", async (c) => mcpHandler.fetch(c.req.raw, c.env, mcpContext(c)));

// Mount the API routes
app.route("/", apiApp);

// Agent WebSocket routing - must be before React Router catch-all
app.all("/agents/*", async (c) => {
	// Path shape: /agents/<agent-name>/<mailboxId>[/...]
	const rawMailbox = c.req.path.split("/")[3];
	if (rawMailbox) {
		const role = await getMailboxRole(c.env, normalizeMailboxId(decodeURIComponent(rawMailbox)), c.get("userEmail"));
		if (!hasRole(role, "member")) return c.text("Not found", 404);
	}
	const response = await routeAgentRequest(c.req.raw, c.env);
	if (response) return response;
	return c.text("Agent not found", 404);
});

// React Router catch-all: serves the SPA for all non-API routes
app.all("*", (c) => {
	return requestHandler(c.req.raw, {
		cloudflare: { env: c.env, ctx: c.executionCtx as ExecutionContext },
	});
});

// Export the Hono app as the default export with an email handler
export default {
	fetch: app.fetch,
	async email(
		event: { raw: ReadableStream; rawSize: number },
		env: Env,
		ctx: ExecutionContext,
	) {
		try {
			await receiveEmail(event, env, ctx);
		} catch (e) {
			console.error("Failed to process incoming email:", (e as Error).message, (e as Error).stack);
			// Re-throw so Cloudflare's email routing can retry delivery or bounce the message.
			// Swallowing the error would silently drop the email.
			throw e;
		}
	},
};
