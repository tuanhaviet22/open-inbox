// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Hono middleware to handle repetitive Mailbox Durable Object instantiation.
 * Checks if the mailbox exists in R2, then instantiates the DO stub
 * and attaches it to the Hono context (`c.var.mailboxStub`).
 */
import { createMiddleware } from "hono/factory";
import type { MailboxDO } from "../durableObject";
import type { Env } from "../types";
import { getMailboxRole, hasRole, type EffectiveRole } from "./auth";

export type MailboxContext = {
	Bindings: Env;
	Variables: {
		mailboxStub: DurableObjectStub<MailboxDO>;
		/** Authenticated user (Cloudflare Access `email` claim). */
		userEmail: string;
		/** The user's role on the current mailbox. */
		mailboxRole: EffectiveRole;
	};
};

/** Canonical form of a mailbox id (an email address): trimmed and lowercased. */
export function normalizeMailboxId(raw: string): string {
	return raw.trim().toLowerCase();
}

export const requireMailbox = createMiddleware<MailboxContext>(async (c, next) => {
	const rawId = c.req.param("mailboxId");
	if (!rawId) return c.json({ error: "Mailbox ID required" }, 400);
	const mailboxId = normalizeMailboxId(decodeURIComponent(rawId));

	// Verify mailbox exists
	const key = `mailboxes/${mailboxId}.json`;
	const obj = await c.env.BUCKET.head(key);
	if (!obj) {
		return c.json({ error: "Not found" }, 404);
	}

	const role = await getMailboxRole(c.env, mailboxId, c.get("userEmail") ?? "");
	// 404 rather than 403 so non-members cannot probe which mailboxes exist.
	if (!hasRole(role, "member")) return c.json({ error: "Not found" }, 404);
	c.set("mailboxRole", role!);

	// Instantiate DO stub
	const ns = c.env.MAILBOX;
	const id = ns.idFromName(mailboxId);
	const stub = ns.get(id);

	c.set("mailboxStub", stub);
	
	await next();
});
