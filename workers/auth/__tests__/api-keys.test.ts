import { describe, expect, it } from "vitest";
import { createApiKey, generateApiKey, verifyApiKey } from "../api-keys";

/** Minimal D1 fake that records statements and returns canned rows. */
function fakeDb(first: unknown = null) {
	const calls: { sql: string; args: unknown[] }[] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...args: unknown[]) => {
				calls.push({ sql, args });
				return { run: async () => ({ meta: { changes: 1 } }), first: async () => first, all: async () => ({ results: [] }) };
			},
		}),
	};
	return { db: db as unknown as D1Database, calls };
}

describe("api keys", () => {
	it("generates prefixed, unique, url-safe keys", () => {
		const a = generateApiKey();
		expect(a).toMatch(/^oik_[A-Za-z0-9_-]{43}$/);
		expect(generateApiKey()).not.toBe(a);
	});

	it("stores only a hash of the key", async () => {
		const { db, calls } = fakeDb();
		const { key } = await createApiKey(db, "u1", "laptop");
		const insert = calls[0];
		expect(insert.args).not.toContain(key);
		expect(insert.args[4]).toMatch(/^[0-9a-f]{64}$/);
		expect(insert.args[3]).toBe(key.slice(0, 8));
	});

	it("rejects keys without the prefix without touching the database", async () => {
		const { db, calls } = fakeDb();
		expect(await verifyApiKey(db, "not-a-key")).toBeNull();
		expect(calls).toHaveLength(0);
	});

	it("returns the owner for a known key and records usage", async () => {
		const { db, calls } = fakeDb({ id: "k1", userId: "u1", email: "Me@X.com" });
		expect(await verifyApiKey(db, "oik_abc")).toEqual({ userId: "u1", email: "me@x.com" });
		expect(calls.at(-1)?.sql).toContain("UPDATE api_key");
	});

	it("returns null for an unknown key", async () => {
		const { db } = fakeDb(null);
		expect(await verifyApiKey(db, "oik_abc")).toBeNull();
	});
});
