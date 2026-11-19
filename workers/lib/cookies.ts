// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Cookie helpers. HTTP/2 sends one `cookie` header per cookie; if a runtime
 * joins them with ", " instead of "; " a cookie parser would read one giant
 * cookie and miss the session. Normalizing keeps the session cookie findable.
 */
export function normalizeCookieHeader(value: string | null): string | null {
	if (!value) return value;
	// ", name=" can only be a join artifact: encoded cookie values never contain a raw comma.
	return value.replace(/,\s+(?=[A-Za-z0-9_.\-%]+=)/g, "; ");
}

/** Names only (never values), safe to log. */
export function cookieNames(value: string | null): string[] {
	return (normalizeCookieHeader(value) ?? "")
		.split(";")
		.map((part) => part.trim().split("=")[0])
		.filter(Boolean);
}

/** Better Auth names it `<prefix>.session_token`, with `__Secure-` in front over HTTPS. */
export const SESSION_COOKIE_SUFFIX = ".session_token";

export function hasSessionCookie(names: string[]): boolean {
	return names.some((n) => n.endsWith(SESSION_COOKIE_SUFFIX));
}

/** `Set-Cookie` reduced to its name and attributes, without the value. */
export function summarizeSetCookie(setCookie: string): string {
	const [pair, ...attrs] = setCookie.split(";").map((p) => p.trim());
	const name = pair.split("=")[0];
	const kept = attrs.map((a) => a.split("=")[0].toLowerCase() === "expires" ? "Expires" : a);
	return [name, ...kept].join("; ");
}
