import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DAILY_SEND_LIMIT, HOURLY_SEND_LIMIT, sendRateLimitError } from "../send-rate-limit";

const NOW = new Date("2026-11-20T12:00:00.000Z").getTime();
const HOUR = 60 * 60 * 1000;

function sqlWith(rows: { folder: string; date: string }[]) {
	const db = new DatabaseSync(":memory:");
	db.exec("CREATE TABLE emails (id TEXT, folder_id TEXT, date TEXT)");
	const insert = db.prepare("INSERT INTO emails (id, folder_id, date) VALUES (?, ?, ?)");
	rows.forEach((row, i) => insert.run(...([String(i), row.folder, row.date] as never[])));
	return {
		exec(query: string, ...params: unknown[]) {
			return db.prepare(query).all(...(params as never[]));
		},
	};
}

const sentAt = (msAgo: number) => ({ folder: "sent", date: new Date(NOW - msAgo).toISOString() });
const hourAgo = 2 * HOUR;

describe("sendRateLimitError", () => {
	it(`blocks the ${HOURLY_SEND_LIMIT + 1}th email sent within an hour`, () => {
		const sql = sqlWith(Array.from({ length: HOURLY_SEND_LIMIT }, () => sentAt(5 * 60 * 1000)));
		expect(sendRateLimitError(sql, NOW)).toContain("per hour");
	});

	it("does not count earlier emails from the same day as the last hour", () => {
		// The old datetime('now') comparison matched every email of the current day,
		// so these 20 sends made the mailbox look like it was over the hourly limit.
		const sql = sqlWith([
			...Array.from({ length: HOURLY_SEND_LIMIT - 1 }, () => sentAt(5 * 60 * 1000)),
			sentAt(hourAgo),
		]);
		expect(sendRateLimitError(sql, NOW)).toBeNull();
	});

	it(`blocks the ${DAILY_SEND_LIMIT + 1}th email sent within a day`, () => {
		const sql = sqlWith([
			...Array.from({ length: HOURLY_SEND_LIMIT - 1 }, () => sentAt(5 * 60 * 1000)),
			...Array.from({ length: DAILY_SEND_LIMIT - HOURLY_SEND_LIMIT + 1 }, () => sentAt(5 * HOUR)),
		]);
		expect(sendRateLimitError(sql, NOW)).toContain("per day");
	});

	it("ignores emails outside the sent folder", () => {
		const sql = sqlWith(Array.from({ length: HOURLY_SEND_LIMIT }, () => ({ folder: "inbox", date: new Date(NOW).toISOString() })));
		expect(sendRateLimitError(sql, NOW)).toBeNull();
	});
});
