// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Per-mailbox outbound send limits.
 *
 * Emails store `date` as an ISO string ("2026-11-20T03:00:00.000Z"). Compare
 * against ISO cutoffs, never `datetime('now')`: SQLite returns
 * "2026-11-20 03:00:00" and "T" sorts after the space, so every email from the
 * current calendar day would match a "last hour" window.
 */
import { Folders } from "../../shared/folders";

export const HOURLY_SEND_LIMIT = 20;
export const DAILY_SEND_LIMIT = 100;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Returns null when under the limit, or a user-facing error message. */
export function sendRateLimitError(
	sql: { exec(query: string, ...bindings: any[]): Iterable<any> },
	now = Date.now(),
): string | null {
	const sentSince = (ms: number) => {
		const rows = [
			...sql.exec(
				`SELECT COUNT(*) AS cnt FROM emails WHERE folder_id = ?1 AND date >= ?2`,
				Folders.SENT,
				new Date(now - ms).toISOString(),
			),
		] as { cnt: number }[];
		return rows[0]?.cnt ?? 0;
	};

	if (sentSince(HOUR_MS) >= HOURLY_SEND_LIMIT) {
		return `Rate limit exceeded: max ${HOURLY_SEND_LIMIT} emails per hour per mailbox`;
	}
	if (sentSince(DAY_MS) >= DAILY_SEND_LIMIT) {
		return `Rate limit exceeded: max ${DAILY_SEND_LIMIT} emails per day per mailbox`;
	}
	return null;
}
