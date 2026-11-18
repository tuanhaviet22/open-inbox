// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { DurableObject } from "cloudflare:workers";
import type { Env } from "../types";

export type MemberRole = "owner" | "member";

export interface Member {
	email: string;
	role: MemberRole;
}

/**
 * Single global Durable Object (`idFromName("global")`) that stores which
 * users belong to which mailbox. Emails are expected to be lowercased by the
 * caller.
 */
export class AccessDO extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS members (
					mailbox_id TEXT NOT NULL,
					email TEXT NOT NULL,
					role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
					PRIMARY KEY (mailbox_id, email)
				);
				CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
			`);
		});
	}

	async getRole(mailboxId: string, email: string): Promise<MemberRole | null> {
		const row = [...this.ctx.storage.sql.exec(
			`SELECT role FROM members WHERE mailbox_id = ?1 AND email = ?2`,
			mailboxId,
			email,
		)][0] as { role: MemberRole } | undefined;
		return row?.role ?? null;
	}

	async listMailboxIds(email: string): Promise<string[]> {
		return [...this.ctx.storage.sql.exec(
			`SELECT mailbox_id FROM members WHERE email = ?1 ORDER BY mailbox_id`,
			email,
		)].map((r) => (r as { mailbox_id: string }).mailbox_id);
	}

	async listMembers(mailboxId: string): Promise<Member[]> {
		return [...this.ctx.storage.sql.exec(
			`SELECT email, role FROM members WHERE mailbox_id = ?1 ORDER BY role DESC, email`,
			mailboxId,
		)] as unknown as Member[];
	}

	async setMember(mailboxId: string, email: string, role: MemberRole): Promise<"ok" | "last_owner"> {
		// Demoting the only owner would orphan the mailbox.
		if (role === "member" && (await this.getRole(mailboxId, email)) === "owner" && this.#ownerCount(mailboxId) <= 1) {
			return "last_owner";
		}
		this.ctx.storage.sql.exec(
			`INSERT INTO members (mailbox_id, email, role) VALUES (?1, ?2, ?3)
			 ON CONFLICT(mailbox_id, email) DO UPDATE SET role = excluded.role`,
			mailboxId,
			email,
			role,
		);
		return "ok";
	}

	async removeMember(mailboxId: string, email: string): Promise<"ok" | "not_found" | "last_owner"> {
		const role = await this.getRole(mailboxId, email);
		if (!role) return "not_found";
		if (role === "owner" && this.#ownerCount(mailboxId) <= 1) return "last_owner";
		this.ctx.storage.sql.exec(`DELETE FROM members WHERE mailbox_id = ?1 AND email = ?2`, mailboxId, email);
		return "ok";
	}

	async deleteMailbox(mailboxId: string): Promise<void> {
		this.ctx.storage.sql.exec(`DELETE FROM members WHERE mailbox_id = ?1`, mailboxId);
	}

	#ownerCount(mailboxId: string): number {
		const row = [...this.ctx.storage.sql.exec(
			`SELECT COUNT(*) AS cnt FROM members WHERE mailbox_id = ?1 AND role = 'owner'`,
			mailboxId,
		)][0] as { cnt: number };
		return row.cnt;
	}
}
