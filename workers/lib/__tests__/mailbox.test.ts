import { describe, expect, it } from "vitest";
import { normalizeMailboxId } from "../mailbox";

describe("normalizeMailboxId", () => {
	it("trims and lowercases", () => {
		expect(normalizeMailboxId("  Hello@Example.COM ")).toBe("hello@example.com");
	});
});
