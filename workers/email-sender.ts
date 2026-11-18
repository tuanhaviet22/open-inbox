// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Email sending via Cloudflare Email Service binding.
 *
 * Uses the `send_email` Worker binding (`env.EMAIL.send()`) to send emails.
 *
 * See: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
 */

export interface SendEmailParams {
	to: string | string[];
	from: string | { email: string; name: string };
	subject: string;
	html?: string;
	text?: string;
	cc?: string | string[];
	bcc?: string | string[];
	replyTo?: string | { email: string; name: string };
	attachments?: {
		content: string; // base64 encoded
		filename: string;
		type: string;
		disposition: "attachment" | "inline";
		contentId?: string;
	}[];
	headers?: Record<string, string>;
}

/**
 * Send an email using the Cloudflare Email Service binding.
 *
 * @param binding  - The `EMAIL` SendEmail binding from env
 * @param params   - Email parameters (to, from, subject, body, etc.)
 * @returns The send result with messageId
 * @throws On validation or delivery errors (error has `.code` property)
 */
export async function sendEmail(
	binding: SendEmail,
	params: SendEmailParams,
): Promise<{ messageId: string }> {
	const message: Record<string, unknown> = {
		to: params.to,
		from: params.from,
		subject: params.subject,
	};

	if (params.html) message.html = params.html;
	if (params.text) message.text = params.text;
	if (params.cc) message.cc = params.cc;
	if (params.bcc) message.bcc = params.bcc;
	if (params.replyTo) message.replyTo = params.replyTo;

	if (params.headers && Object.keys(params.headers).length > 0) {
		message.headers = params.headers;
	}

	if (params.attachments && params.attachments.length > 0) {
		message.attachments = params.attachments.map((att) => ({
			content: att.content,
			filename: att.filename,
			type: att.type,
			disposition: att.disposition,
			...(att.contentId ? { contentId: att.contentId } : {}),
		}));
	}

	const result = await binding.send(message as any);
	return { messageId: result.messageId };
}

// ── Providers ──────────────────────────────────────────────────────

/** Anything that can deliver an outbound email. */
export interface EmailProvider {
	readonly name: string;
	send(params: SendEmailParams): Promise<{ messageId: string }>;
}

export function cloudflareProvider(binding: SendEmail): EmailProvider {
	return { name: "cloudflare", send: (params) => sendEmail(binding, params) };
}

/**
 * Relay provider: POSTs the message as JSON to an HTTPS endpoint you run
 * (an SMTP bridge, SES/Postmark/Mailgun adapter, ...). Workers cannot open
 * raw SMTP/IMAP sockets, so an HTTP relay is the portable option.
 * The endpoint should answer 2xx, optionally with `{ "messageId": "..." }`.
 */
export function webhookProvider(url: string, secret?: string, fetchImpl: typeof fetch = fetch): EmailProvider {
	return {
		name: "webhook",
		async send(params) {
			const res = await fetchImpl(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(secret ? { Authorization: `Bearer ${secret}` } : {}),
				},
				body: JSON.stringify(params),
			});
			if (!res.ok) throw new Error(`Outbound webhook failed with status ${res.status}`);
			const data = (await res.json().catch(() => ({}))) as { messageId?: string };
			return { messageId: data.messageId ?? crypto.randomUUID() };
		},
	};
}

/** Pick the outbound provider: the webhook relay when configured, else Cloudflare. */
export function getEmailProvider(env: {
	EMAIL: SendEmail;
	OUTBOUND_WEBHOOK_URL?: string;
	OUTBOUND_WEBHOOK_SECRET?: string;
}): EmailProvider {
	return env.OUTBOUND_WEBHOOK_URL
		? webhookProvider(env.OUTBOUND_WEBHOOK_URL, env.OUTBOUND_WEBHOOK_SECRET)
		: cloudflareProvider(env.EMAIL);
}
