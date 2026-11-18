// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Authorization helpers.
 *
 * Authentication is Cloudflare Access (see workers/app.ts); this module decides
 * what an authenticated user may do. Enforcement is opt-in: it turns on when
 * `ADMIN_EMAILS` is set. Without it the app keeps the original shared-trust
 * model where every authenticated user can use every mailbox.
 */
import type { MemberRole } from "../access";
import type { Env } from "../types";

/** "admin" can do anything; "owner" manages a mailbox; "member" uses it. */
export type EffectiveRole = "admin" | MemberRole;

export function parseEmailList(raw: string | undefined | null): string[] {
	return (raw ?? "")
		.split(",")
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
}

export function isAuthzEnabled(env: { ADMIN_EMAILS?: string }): boolean {
	return parseEmailList(env.ADMIN_EMAILS).length > 0;
}

export function isAdmin(env: { ADMIN_EMAILS?: string }, email: string): boolean {
	return parseEmailList(env.ADMIN_EMAILS).includes(email.toLowerCase());
}

const RANK: Record<EffectiveRole, number> = { member: 1, owner: 2, admin: 3 };

export function hasRole(role: EffectiveRole | null, min: MemberRole): boolean {
	return role !== null && RANK[role] >= RANK[min];
}

export function getAccessStub(env: Pick<Env, "ACCESS">) {
	return env.ACCESS.get(env.ACCESS.idFromName("global"));
}

/** Role of `email` on `mailboxId`, or null when the user has no access. */
export async function getMailboxRole(env: Env, mailboxId: string, email: string): Promise<EffectiveRole | null> {
	if (!isAuthzEnabled(env)) return "admin";
	if (isAdmin(env, email)) return "admin";
	return getAccessStub(env).getRole(mailboxId, email.toLowerCase());
}

/** Mailbox ids visible to `email` out of `all`. */
export async function filterVisibleMailboxes<T extends { id: string }>(env: Env, email: string, all: T[]): Promise<T[]> {
	if (!isAuthzEnabled(env) || isAdmin(env, email)) return all;
	const ids = new Set(await getAccessStub(env).listMailboxIds(email.toLowerCase()));
	return all.filter((m) => ids.has(m.id));
}
