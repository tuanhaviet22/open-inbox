// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Filter rules: "when a new email matches <conditions>, do <actions>".
 * Matching is pure so it can be unit-tested; MailboxDO applies the actions.
 */
import { z } from "zod";
import { foldText, htmlToSearchText } from "../../shared/text";

const text = z.string().trim().min(1).max(200);

export const FilterConditionsSchema = z
	.object({
		from: text.optional(),
		to: text.optional(),
		subject: text.optional(),
		/** Matches anywhere in the subject or body. */
		contains: text.optional(),
	})
	.refine((c) => Object.values(c).some((v) => v !== undefined), { message: "At least one condition is required" });

export const FilterActionsSchema = z
	.object({
		labelId: z.string().min(1).optional(),
		moveTo: z.string().min(1).optional(),
		markRead: z.boolean().optional(),
		star: z.boolean().optional(),
	})
	.refine((a) => Object.values(a).some((v) => v !== undefined), { message: "At least one action is required" });

export const FilterRuleBodySchema = z.object({
	name: z.string().trim().min(1).max(100),
	enabled: z.boolean().default(true),
	conditions: FilterConditionsSchema,
	actions: FilterActionsSchema,
});

export type FilterConditions = z.infer<typeof FilterConditionsSchema>;
export type FilterActions = z.infer<typeof FilterActionsSchema>;

export interface FilterRule {
	id: string;
	name: string;
	enabled: boolean;
	conditions: FilterConditions;
	actions: FilterActions;
	position: number;
}

export interface FilterableEmail {
	sender: string;
	recipient: string;
	cc?: string | null;
	subject: string;
	body?: string | null;
}

/** All given conditions must match (AND); comparison ignores case and accents. */
export function matchesFilter(c: FilterConditions, email: FilterableEmail): boolean {
	const has = (haystack: string | null | undefined, needle: string) => foldText(haystack).includes(foldText(needle));
	if (c.from && !has(email.sender, c.from)) return false;
	if (c.to && !has(`${email.recipient} ${email.cc ?? ""}`, c.to)) return false;
	if (c.subject && !has(email.subject, c.subject)) return false;
	if (c.contains && !has(`${email.subject} ${htmlToSearchText(email.body)}`, c.contains)) return false;
	return true;
}

/**
 * Combine the actions of every matching rule (in order). Labels accumulate;
 * for moveTo the last matching rule wins; booleans are true if any rule sets them.
 */
export function collectActions(rules: FilterRule[], email: FilterableEmail) {
	const labelIds = new Set<string>();
	let moveTo: string | undefined;
	let markRead = false;
	let star = false;
	for (const rule of rules) {
		if (!rule.enabled || !matchesFilter(rule.conditions, email)) continue;
		if (rule.actions.labelId) labelIds.add(rule.actions.labelId);
		if (rule.actions.moveTo) moveTo = rule.actions.moveTo;
		if (rule.actions.markRead) markRead = true;
		if (rule.actions.star) star = true;
	}
	return { labelIds: [...labelIds], moveTo, markRead, star };
}
