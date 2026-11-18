import { describe, expect, it } from "vitest";
import { collectActions, FilterRuleBodySchema, matchesFilter, type FilterRule } from "../filters";

const email = {
	sender: "billing@shop.example",
	recipient: "me@example.com",
	subject: "Hóa đơn tháng 5",
	body: "<p>Số tiền cần thanh toán</p>",
};

const rule = (over: Partial<FilterRule> & Pick<FilterRule, "conditions" | "actions">): FilterRule => ({
	id: "r",
	name: "r",
	enabled: true,
	position: 0,
	...over,
});

describe("matchesFilter", () => {
	it("requires all conditions to match", () => {
		expect(matchesFilter({ from: "billing", subject: "hoa don" }, email)).toBe(true);
		expect(matchesFilter({ from: "billing", subject: "other" }, email)).toBe(false);
	});

	it("ignores case and accents", () => {
		expect(matchesFilter({ contains: "SO TIEN" }, email)).toBe(true);
	});

	it("searches body text without matching HTML tags", () => {
		expect(matchesFilter({ contains: "<p>" }, email)).toBe(false);
	});
});

describe("collectActions", () => {
	it("merges matching rules and skips disabled or non-matching ones", () => {
		const rules = [
			rule({ id: "1", conditions: { from: "billing" }, actions: { labelId: "L1", moveTo: "archive" } }),
			rule({ id: "2", conditions: { subject: "hóa đơn" }, actions: { labelId: "L2", moveTo: "trash", markRead: true } }),
			rule({ id: "3", enabled: false, conditions: { from: "billing" }, actions: { star: true } }),
			rule({ id: "4", conditions: { from: "nobody" }, actions: { star: true } }),
		];
		expect(collectActions(rules, email)).toEqual({ labelIds: ["L1", "L2"], moveTo: "trash", markRead: true, star: false });
	});
});

describe("FilterRuleBodySchema", () => {
	it("requires at least one condition and one action", () => {
		expect(FilterRuleBodySchema.safeParse({ name: "x", conditions: {}, actions: { star: true } }).success).toBe(false);
		expect(FilterRuleBodySchema.safeParse({ name: "x", conditions: { from: "a" }, actions: {} }).success).toBe(false);
		expect(FilterRuleBodySchema.safeParse({ name: "x", conditions: { from: "a" }, actions: { star: true } }).success).toBe(true);
	});
});
