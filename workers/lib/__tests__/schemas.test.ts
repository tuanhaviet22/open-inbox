import { describe, expect, it } from "vitest";
import {
	CreateMailboxBodySchema,
	FolderNameBodySchema,
	MailboxSettingsSchema,
	MoveEmailBodySchema,
	UpdateMailboxBodySchema,
	UpdateEmailBodySchema,
} from "../schemas";

describe("request body schemas", () => {
	it("rejects an invalid mailbox email", () => {
		expect(CreateMailboxBodySchema.safeParse({ email: "nope", name: "x" }).success).toBe(false);
	});

	it("rejects an oversized agent prompt", () => {
		const r = MailboxSettingsSchema.safeParse({ agentSystemPrompt: "a".repeat(10_001) });
		expect(r.success).toBe(false);
	});

	it("strips unknown settings keys", () => {
		const r = MailboxSettingsSchema.parse({ fromName: "A", evil: 1 });
		expect(r).toEqual({ fromName: "A" });
	});

	it("rejects non-boolean email flags", () => {
		expect(UpdateEmailBodySchema.safeParse({ read: "yes" }).success).toBe(false);
	});

	it("requires a folderId when moving", () => {
		expect(MoveEmailBodySchema.safeParse({}).success).toBe(false);
	});

	it("trims folder names and rejects blank ones", () => {
		expect(FolderNameBodySchema.parse({ name: "  Work " }).name).toBe("Work");
		expect(FolderNameBodySchema.safeParse({ name: "   " }).success).toBe(false);
	});

	describe("signatures in mailbox settings", () => {
		const sig = (id: string, name: string) => ({ id, name, text: "t" });

		it("accepts several signatures with a default", () => {
			const r = UpdateMailboxBodySchema.safeParse({
				settings: { signatures: [sig("a", "Work"), sig("b", "Personal")], defaultSignatureId: "a" },
			});
			expect(r.success).toBe(true);
		});

		it("rejects a default that does not exist, duplicate names and empty names", () => {
			expect(UpdateMailboxBodySchema.safeParse({ settings: { signatures: [sig("a", "A")], defaultSignatureId: "x" } }).success).toBe(false);
			expect(UpdateMailboxBodySchema.safeParse({ settings: { signatures: [sig("a", "A"), sig("b", "a")] } }).success).toBe(false);
			expect(UpdateMailboxBodySchema.safeParse({ settings: { signatures: [sig("a", "  ")] } }).success).toBe(false);
		});
	});
});
