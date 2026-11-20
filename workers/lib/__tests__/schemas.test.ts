import { describe, expect, it } from "vitest";
import {
	CreateMailboxBodySchema,
	EMAIL_MAX_BYTES,
	EMAIL_MAX_RECIPIENTS,
	EMAIL_MAX_SUBJECT_LENGTH,
	FolderNameBodySchema,
	MailboxSettingsSchema,
	MoveEmailBodySchema,
	SendEmailRequestSchema,
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

	describe("send email limits", () => {
		const base = { to: "a@example.com", from: "me@example.com", subject: "Hi", html: "<p>Hi</p>" };
		const attachment = (content: string) => ({ content, filename: "f.pdf", type: "application/pdf", disposition: "attachment" as const });

		it("accepts a normal message", () => {
			expect(SendEmailRequestSchema.safeParse(base).success).toBe(true);
		});

		it("rejects a subject longer than the RFC limit", () => {
			const subject = "a".repeat(EMAIL_MAX_SUBJECT_LENGTH + 1);
			expect(SendEmailRequestSchema.safeParse({ ...base, subject }).success).toBe(false);
		});

		it("rejects more recipients than Cloudflare accepts across to, cc and bcc", () => {
			const to = Array.from({ length: EMAIL_MAX_RECIPIENTS }, (_, i) => `u${i}@example.com`);
			expect(SendEmailRequestSchema.safeParse({ ...base, to, cc: "one@example.com" }).success).toBe(false);
		});

		it("rejects a message over 5 MiB including attachments", () => {
			// base64 of 5.25 MiB decoded payload
			const content = "A".repeat(Math.ceil((EMAIL_MAX_BYTES * 4) / 3) + 4);
			expect(SendEmailRequestSchema.safeParse({ ...base, attachments: [attachment(content)] }).success).toBe(false);
		});

		it("rejects a message whose text body alone is over the limit", () => {
			expect(SendEmailRequestSchema.safeParse({ ...base, text: "a".repeat(EMAIL_MAX_BYTES + 1) }).success).toBe(false);
		});
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
