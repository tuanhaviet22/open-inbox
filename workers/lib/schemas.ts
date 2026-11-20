// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Shared types and Zod schemas for email data.
 *
 * Types (from email-types.ts): used by the agent, MCP server, and route
 * handlers to avoid `as any` casting.
 *
 * Zod schemas: used across route handlers to eliminate duplication.
 */
import { z } from "zod";
import { SUPPORTED_LOCALES } from "../../shared/locales";
import { MAX_SIGNATURES, validateSignatures } from "../../shared/signatures";
import { MIN_PASSWORD_LENGTH } from "../auth/constants";

// ── TypeScript Interfaces ──────────────────────────────────────────

export interface EmailMetadata {
	id: string;
	subject: string;
	sender: string;
	recipient: string;
	cc?: string | null;
	bcc?: string | null;
	date: string;
	read: boolean;
	starred: boolean;
	in_reply_to?: string | null;
	email_references?: string | null;
	thread_id?: string | null;
	folder_id?: string | null;
	snippet?: string | null;
}

export interface EmailFull extends EmailMetadata {
	body?: string | null;
	message_id?: string | null;
	raw_headers?: string | null;
	attachments?: AttachmentInfo[];
}

export interface AttachmentInfo {
	id: string;
	filename: string;
	mimetype: string;
	size: number;
	content_id?: string | null;
	disposition?: string | null;
}

// ── Zod Schemas ────────────────────────────────────────────────────

/** Cloudflare Email Service limits: 5 MiB per message including attachments. */
export const EMAIL_MAX_BYTES = 5 * 1024 * 1024;
/** Cloudflare Email Service: at most 50 recipients across to + cc + bcc. */
export const EMAIL_MAX_RECIPIENTS = 50;
/** RFC 5322 / Cloudflare Email Service: subject at most 998 characters. */
export const EMAIL_MAX_SUBJECT_LENGTH = 998;

const RecipientFieldSchema = z.union([
	z.string().email(),
	z.array(z.string().email()).min(1),
]);

function recipientCount(value: string | string[] | undefined): number {
	return Array.isArray(value) ? value.length : value ? 1 : 0;
}

/** Decoded byte size of a base64 string, without allocating the decoded buffer. */
function base64Bytes(value: string): number {
	return Math.floor((value.length * 3) / 4);
}

export const ErrorResponseSchema = z.object({
	error: z.string(),
});

export const SendEmailRequestSchema = z
	.object({
		to: RecipientFieldSchema,
		cc: RecipientFieldSchema.optional(),
		bcc: RecipientFieldSchema.optional(),
		from: z.union([
			z.string().email(),
			z.object({ email: z.string().email(), name: z.string() }),
		]),
		subject: z.string().max(EMAIL_MAX_SUBJECT_LENGTH),
		html: z.string().optional(),
		text: z.string().optional(),
		attachments: z
			.array(
				z.object({
					content: z.string(), // base64 encoded
					filename: z.string(),
					type: z.string(),
					disposition: z.enum(["attachment", "inline"]),
					contentId: z.string().optional(),
				}),
			)
			.optional(),
		in_reply_to: z.string().optional(),
		references: z.array(z.string()).optional(),
		thread_id: z.string().optional(),
	})
	.refine((data) => data.html || data.text, {
		message: "Either 'html' or 'text' must be provided",
	})
	.superRefine((data, ctx) => {
		const recipients =
			recipientCount(data.to) + recipientCount(data.cc) + recipientCount(data.bcc);
		if (recipients > EMAIL_MAX_RECIPIENTS) {
			ctx.addIssue({
				code: "custom",
				path: ["to"],
				message: `At most ${EMAIL_MAX_RECIPIENTS} recipients across to, cc and bcc`,
			});
		}

		const attachmentBytes = (data.attachments ?? []).reduce(
			(total, attachment) => total + base64Bytes(attachment.content),
			0,
		);
		const bodyBytes = new TextEncoder().encode(`${data.html ?? ""}${data.text ?? ""}`).length;
		if (attachmentBytes + bodyBytes > EMAIL_MAX_BYTES) {
			ctx.addIssue({
				code: "custom",
				path: ["attachments"],
				message: `Message must be at most ${EMAIL_MAX_BYTES / 1024 / 1024} MiB including attachments`,
			});
		}
	});

export const SendEmailResponseSchema = z.object({
	id: z.string(),
	status: z.string(),
});

// ── Request body schemas ───────────────────────────────────────────

export const MailboxSettingsSchema = z
	.object({
		fromName: z.string().max(200).optional(),
		forwarding: z.object({ enabled: z.boolean(), email: z.string().max(320) }).optional(),
		/** Legacy single signature; superseded by `signatures`. */
		signature: z
			.object({ enabled: z.boolean(), text: z.string().max(10_000), html: z.string().max(50_000).optional() })
			.optional(),
		signatures: z
			.array(
				z.object({
					id: z.string().min(1).max(64),
					name: z.string().trim().min(1).max(100),
					text: z.string().max(10_000),
					html: z.string().max(50_000).optional(),
				}),
			)
			.max(MAX_SIGNATURES)
			.optional(),
		defaultSignatureId: z.string().max(64).optional(),
		autoReply: z
			.object({ enabled: z.boolean(), subject: z.string().max(500), message: z.string().max(10_000) })
			.optional(),
		agentSystemPrompt: z.string().max(10_000).optional(),
		/** Language of text added to outgoing mail (quote headers etc.). */
		locale: z.enum(SUPPORTED_LOCALES).optional(),
	});

export const CreateMailboxBodySchema = z.object({
	email: z.string().email(),
	name: z.string().min(1).max(200),
	settings: MailboxSettingsSchema.partial().optional(),
	/** Initial owner when authorization is enabled; defaults to the creator. */
	owner: z.string().email().optional(),
});

export const SetMemberBodySchema = z.object({
	email: z.string().email(),
	role: z.enum(["owner", "member"]),
});

export const UpdateMailboxBodySchema = z.object({ settings: MailboxSettingsSchema }).superRefine((body, ctx) => {
	const problem = validateSignatures(body.settings);
	if (problem) ctx.addIssue({ code: "custom", path: ["settings", "signatures"], message: problem });
});

export const UpdateEmailBodySchema = z.object({
	read: z.boolean().optional(),
	starred: z.boolean().optional(),
});

export const MoveEmailBodySchema = z.object({ folderId: z.string().min(1) });

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb color");

export const LabelBodySchema = z.object({
	name: z.string().trim().min(1).max(50),
	color: hexColor.optional(),
});

export const UpdateLabelBodySchema = LabelBodySchema.partial();

export const EmailLabelBodySchema = z.object({ labelId: z.string().min(1) });

export const CreateUserBodySchema = z.object({
	email: z.string().email(),
	name: z.string().trim().max(100).optional(),
	password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
});

export const SetPasswordBodySchema = z.object({ password: z.string().min(MIN_PASSWORD_LENGTH).max(128) });

export const ApiKeyBodySchema = z.object({ name: z.string().trim().min(1).max(100) });

export const FolderNameBodySchema = z.object({ name: z.string().trim().min(1).max(100) });
