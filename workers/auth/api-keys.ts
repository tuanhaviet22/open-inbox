// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * API keys for clients that cannot hold a browser session (MCP). The raw key is
 * shown once; only its SHA-256 is stored.
 */
const KEY_PREFIX = "oik_";

async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateApiKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return KEY_PREFIX + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface ApiKeyInfo {
	id: string;
	name: string;
	prefix: string;
	created_at: string;
	last_used_at: string | null;
}

export async function createApiKey(db: D1Database, userId: string, name: string) {
	const key = generateApiKey();
	const id = crypto.randomUUID();
	await db
		.prepare(`INSERT INTO api_key (id, user_id, name, prefix, key_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
		.bind(id, userId, name, key.slice(0, 8), await sha256Hex(key), new Date().toISOString())
		.run();
	return { id, name, key };
}

export async function listApiKeys(db: D1Database, userId: string): Promise<ApiKeyInfo[]> {
	const { results } = await db
		.prepare(`SELECT id, name, prefix, created_at, last_used_at FROM api_key WHERE user_id = ?1 ORDER BY created_at DESC`)
		.bind(userId)
		.all<ApiKeyInfo>();
	return results;
}

export async function deleteApiKey(db: D1Database, userId: string, id: string): Promise<boolean> {
	const res = await db.prepare(`DELETE FROM api_key WHERE id = ?1 AND user_id = ?2`).bind(id, userId).run();
	return (res.meta.changes ?? 0) > 0;
}

/** Resolve a raw key to its owner, or null. */
export async function verifyApiKey(db: D1Database, key: string): Promise<{ userId: string; email: string } | null> {
	if (!key.startsWith(KEY_PREFIX)) return null;
	const row = await db
		.prepare(`SELECT k.id AS id, u.id AS userId, u.email AS email FROM api_key k JOIN "user" u ON u.id = k.user_id WHERE k.key_hash = ?1`)
		.bind(await sha256Hex(key))
		.first<{ id: string; userId: string; email: string }>();
	if (!row) return null;
	await db.prepare(`UPDATE api_key SET last_used_at = ?1 WHERE id = ?2`).bind(new Date().toISOString(), row.id).run();
	return { userId: row.userId, email: row.email.toLowerCase() };
}
