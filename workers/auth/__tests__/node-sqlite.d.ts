// @types/node 20 predates node:sqlite; declare only what the integration test uses.
declare module "node:sqlite" {
	export class DatabaseSync {
		constructor(path: string);
		exec(sql: string): void;
		prepare(sql: string): {
			all(...args: never[]): unknown[];
			get(...args: never[]): unknown;
			run(...args: never[]): { changes: number | bigint; lastInsertRowid: number | bigint };
		};
	}
}
