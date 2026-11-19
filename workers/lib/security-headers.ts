// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { MiddlewareHandler } from "hono";

/**
 * Headers every response gets. The enforced CSP only holds the directives that cannot break
 * the app (framing, base URI, plugins, form targets). The full policy runs in report-only
 * mode first: the hydration script is inline and the composer shows remote signature images,
 * so it should be checked in the browser console before it is enforced.
 */
export const SECURITY_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
	"Cross-Origin-Opener-Policy": "same-origin",
	"Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
	"Content-Security-Policy-Report-Only": [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob: https:",
		"font-src 'self' data:",
		"connect-src 'self' wss: https://cloudflareinsights.com",
		"frame-src 'self' about: blob: data:",
		"worker-src 'self' blob:",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"object-src 'none'",
		"form-action 'self'",
	].join("; "),
};

const HSTS = "max-age=31536000; includeSubDomains";

export function securityHeaders(): MiddlewareHandler {
	return async (c, next) => {
		await next();
		// A WebSocket upgrade response cannot be touched or re-created.
		if (c.res.status === 101 || c.req.header("upgrade")) return;

		const apply = (headers: Headers) => {
			for (const [name, value] of Object.entries(SECURITY_HEADERS)) if (!headers.has(name)) headers.set(name, value);
			if (new URL(c.req.url).protocol === "https:" && !headers.has("Strict-Transport-Security")) {
				headers.set("Strict-Transport-Security", HSTS);
			}
		};
		try {
			apply(c.res.headers);
		} catch {
			// Responses from fetch() or Response.redirect() have immutable headers: copy, then set.
			c.res = new Response(c.res.body, c.res);
			apply(c.res.headers);
		}
	};
}
