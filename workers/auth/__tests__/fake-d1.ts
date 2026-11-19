import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Real Better Auth + our SQL migrations, with a node:sqlite database standing in
 * for D1 (same prepare/bind/all surface that kysely-d1 uses). This is the
 * closest we get to production without a Cloudflare account.
 */
export function fakeD1(): D1Database {
	const sqlite = new DatabaseSync(":memory:");
	sqlite.exec("PRAGMA foreign_keys = ON");
	for (const file of ["0001_better_auth.sql", "0002_api_keys.sql"]) {
		sqlite.exec(readFileSync(join(__dirname, "../../../migrations", file), "utf8"));
	}
	const norm = (args: unknown[]) => args.map((a) => (a instanceof Date ? a.toISOString() : typeof a === "boolean" ? Number(a) : a)) as never[];
	return {
		prepare(sql: string) {
			return {
				bind(...args: unknown[]) {
					const stmt = sqlite.prepare(sql);
					const reads = /^\s*(select|pragma|with)/i.test(sql) || /returning/i.test(sql);
					return {
						async all() {
							if (reads) return { results: stmt.all(...norm(args)), meta: { changes: 0, last_row_id: null } };
							const r = stmt.run(...norm(args));
							return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
						},
						async run() {
							const r = reads ? { changes: 0 } : stmt.run(...norm(args));
							return { meta: { changes: Number(r.changes) } };
						},
						async first() {
							return (stmt.get(...norm(args)) as unknown) ?? null;
						},
					};
				},
			};
		},
	} as unknown as D1Database;
}

