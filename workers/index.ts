// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { type Context, Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import PostalMime from "postal-mime";
import { z } from "zod";
import { getEmailProvider } from "./email-sender";
import { deleteAttachmentObjects, storeAttachments, type StoredAttachment } from "./lib/attachments";
import {
	validateSender,
	SenderValidationError,
	generateMessageId,
	buildThreadingHeaders,
	listMailboxes,
} from "./lib/email-helpers";
import { getAccessStub, getMailboxRole, hasRole, isAdmin, isAuthzEnabled, filterVisibleMailboxes } from "./lib/auth";
import { FilterRuleBodySchema } from "./lib/filters";
import {
	ApiKeyBodySchema,
	CreateMailboxBodySchema,
	CreateUserBodySchema,
	SetPasswordBodySchema,
	EmailLabelBodySchema,
	LabelBodySchema,
	UpdateLabelBodySchema,
	SetMemberBodySchema,
	FolderNameBodySchema,
	MoveEmailBodySchema,
	SendEmailRequestSchema,
	UpdateEmailBodySchema,
	UpdateMailboxBodySchema,
} from "./lib/schemas";
import { handleReplyEmail, handleForwardEmail } from "./routes/reply-forward";
import type { GetEmailsOptions, SearchFilterOptions } from "./durableObject";
import { Folders } from "../shared/folders";
import type { Env } from "./types";
import { slugify } from "./lib/slug";
import { createAuth, createUserWithPassword, deleteUser, getAuthMode, listUsers, setUserPassword } from "./auth";
import { createApiKey, deleteApiKey, listApiKeys } from "./auth/api-keys";
import { normalizeMailboxId, requireMailbox, type MailboxContext } from "./lib/mailbox";

type AppContext = Context<MailboxContext>;

// -- Request body schemas (kept for validation) ---------------------

const DraftBody = z.object({
	to: z.string().optional(),
	cc: z.string().optional(),
	bcc: z.string().optional(),
	subject: z.string().optional(),
	body: z.string(),
	in_reply_to: z.string().optional(),
	thread_id: z.string().optional(),
	draft_id: z.string().optional(),
});

// -- Helpers --------------------------------------------------------

/**
 * Narrow view of the stub for list calls whose inferred RPC return type is so
 * deep that tsc gives up (TS2589). Results are only forwarded as JSON.
 */
type ListStub = {
	getEmails(o: GetEmailsOptions): Promise<unknown>;
	getThreadedEmails(o: GetEmailsOptions): Promise<unknown>;
	getThreadEmails(threadId: string): Promise<unknown>;
	searchEmails(o: SearchFilterOptions & { page?: number; limit?: number }): Promise<unknown>;
};

/** Serialize directly; c.json() hits TS2589 on deep drizzle row types. */
function jsonResponse(data: unknown): Response {
	return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
}

function intQuery(c: AppContext, key: string): number | undefined {
	const v = c.req.query(key);
	if (!v) return undefined;
	const n = Number(v);
	return Number.isNaN(n) ? undefined : n;
}

function boolQuery(c: AppContext, key: string): boolean | undefined {
	const v = c.req.query(key);
	if (v === undefined || v === "") return undefined;
	return v === "true" || v === "1";
}

// -- App & middleware -----------------------------------------------

const app = new Hono<MailboxContext>();
app.use("/api/*", cors({
	origin: (origin) => {
		// Same-origin requests have no Origin header — allow them.
		if (!origin) return origin;
		// In development, allow localhost for Vite dev server.
		try {
			const url = new URL(origin);
			if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return origin;
		} catch { /* invalid origin */ }
		// Block all other cross-origin requests. The app is served from the
		// same origin as the API, so legitimate browser requests never send
		// an Origin header. Returning undefined omits Access-Control-Allow-Origin.
		return undefined;
	},
}));
app.use("/api/v1/mailboxes/:mailboxId/*", requireMailbox);

app.onError((err, c) => {
	if (err instanceof z.ZodError) {
		return c.json({ error: "Invalid request", issues: err.issues }, 400);
	}
	console.error("Unhandled error:", err.message);
	return c.json({ error: "Internal server error" }, 500);
});

// -- Config ---------------------------------------------------------

app.get("/api/v1/config", (c) => {
	const domainsRaw = c.env.DOMAINS || "";
	const domains = domainsRaw.split(",").map((d) => d.trim()).filter(Boolean);
	const emailAddresses = c.env.EMAIL_ADDRESSES ?? [];
	return c.json({ domains, emailAddresses });
});

// -- Mailboxes ------------------------------------------------------

app.get("/api/v1/me", (c) => {
	const email = c.get("userEmail") ?? "";
	return c.json({
		email,
		isAdmin: !isAuthzEnabled(c.env) || isAdmin(c.env, email),
		authzEnabled: isAuthzEnabled(c.env),
		authMode: getAuthMode(c.env),
	});
});

// -- Users and API keys (AUTH_MODE=password) -------------------------

const passwordModeOnly: MiddlewareHandler<MailboxContext> = async (c, next) =>
	getAuthMode(c.env) === "password" ? next() : c.json({ error: "Not found" }, 404);

const adminOnly: MiddlewareHandler<MailboxContext> = async (c, next) =>
	isAdmin(c.env, c.get("userEmail") ?? "") ? next() : c.json({ error: "Admins only" }, 403);

app.use("/api/v1/admin/*", passwordModeOnly, adminOnly);
app.use("/api/v1/me/api-keys", passwordModeOnly);
app.use("/api/v1/me/api-keys/*", passwordModeOnly);

app.get("/api/v1/admin/users", async (c) => c.json(await listUsers(createAuth(c.env, c.req.raw))));

app.post("/api/v1/admin/users", async (c) => {
	const { email, name, password } = CreateUserBodySchema.parse(await c.req.json());
	const user = await createUserWithPassword(createAuth(c.env, c.req.raw), { email, name: name ?? "", password });
	return user === "exists" ? c.json({ error: "A user with this email already exists" }, 409) : c.json(user, 201);
});

app.put("/api/v1/admin/users/:id/password", async (c) => {
	const { password } = SetPasswordBodySchema.parse(await c.req.json());
	await setUserPassword(createAuth(c.env, c.req.raw), c.req.param("id")!, password);
	return c.body(null, 204);
});

app.delete("/api/v1/admin/users/:id", async (c) => {
	const auth = createAuth(c.env, c.req.raw);
	const target = (await listUsers(auth)).find((u) => u.id === c.req.param("id"));
	if (!target) return c.json({ error: "User not found" }, 404);
	// Deleting yourself would lock the last admin out.
	if (target.email.toLowerCase() === c.get("userEmail")) return c.json({ error: "You cannot delete your own account" }, 400);
	await deleteUser(auth, target.id);
	await getAccessStub(c.env).removeUser(target.email.toLowerCase());
	return c.body(null, 204);
});

/** API keys can only be managed from a browser session, never with a key itself. */
const sessionUserId = (c: Context<MailboxContext>) => (c.get("authMethod") === "session" ? (c.get("userId") ?? null) : null);

app.get("/api/v1/me/api-keys", async (c) => {
	const userId = sessionUserId(c);
	return userId ? c.json(await listApiKeys(c.env.DB, userId)) : c.json({ error: "Sign in with a password session" }, 403);
});

app.post("/api/v1/me/api-keys", async (c) => {
	const userId = sessionUserId(c);
	if (!userId) return c.json({ error: "Sign in with a password session" }, 403);
	const { name } = ApiKeyBodySchema.parse(await c.req.json());
	return c.json(await createApiKey(c.env.DB, userId, name), 201);
});

app.delete("/api/v1/me/api-keys/:id", async (c) => {
	const userId = sessionUserId(c);
	if (!userId) return c.json({ error: "Sign in with a password session" }, 403);
	return (await deleteApiKey(c.env.DB, userId, c.req.param("id")!)) ? c.body(null, 204) : c.json({ error: "Key not found" }, 404);
});

app.get("/api/v1/mailboxes", async (c) => {
	const allMailboxes = await listMailboxes(c.env.BUCKET);
	const visible = await filterVisibleMailboxes(c.env, c.get("userEmail") ?? "", allMailboxes);
	return c.json(visible.map((m) => ({ ...m, name: m.id })));
});

app.post("/api/v1/mailboxes", async (c) => {
	const { name, settings, email: rawEmail, owner } = CreateMailboxBodySchema.parse(await c.req.json());
	const userEmail = c.get("userEmail") ?? "";
	if (isAuthzEnabled(c.env) && !isAdmin(c.env, userEmail)) {
		return c.json({ error: "Only admins can create mailboxes" }, 403);
	}
	const email = normalizeMailboxId(rawEmail);
	const allowedAddresses = (c.env.EMAIL_ADDRESSES ?? []) as string[];
	if (allowedAddresses.length > 0 && !allowedAddresses.map((a) => a.toLowerCase()).includes(email)) {
		return c.json({ error: "Mailbox creation is restricted to configured EMAIL_ADDRESSES" }, 403);
	}
	const key = `mailboxes/${email}.json`;
	if (await c.env.BUCKET.head(key)) return c.json({ error: "Mailbox already exists" }, 409);
	const defaultSettings = { fromName: name, forwarding: { enabled: false, email: "" }, signature: { enabled: false, text: "" }, autoReply: { enabled: false, subject: "", message: "" } };
	const finalSettings = { ...defaultSettings, ...settings };
	await c.env.BUCKET.put(key, JSON.stringify(finalSettings));
	const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(email));
	await stub.getFolders();
	if (isAuthzEnabled(c.env)) {
		await getAccessStub(c.env).setMember(email, normalizeMailboxId(owner ?? userEmail), "owner");
	}
	return c.json({ id: email, email, name, settings: finalSettings }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = normalizeMailboxId(c.req.param("mailboxId")!);
	if (!hasRole(await getMailboxRole(c.env, mailboxId, c.get("userEmail") ?? ""), "member")) return c.json({ error: "Not found" }, 404);
	const obj = await c.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
	if (!obj) return c.json({ error: "Not found" }, 404);
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings: await obj.json() });
});

app.put("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = normalizeMailboxId(c.req.param("mailboxId")!);
	if (!hasRole(await getMailboxRole(c.env, mailboxId, c.get("userEmail") ?? ""), "owner")) return c.json({ error: "Not found" }, 404);
	const { settings } = UpdateMailboxBodySchema.parse(await c.req.json());
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	await c.env.BUCKET.put(key, JSON.stringify(settings));
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings });
});

app.delete("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = normalizeMailboxId(c.req.param("mailboxId")!);
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	if (!hasRole(await getMailboxRole(c.env, mailboxId, c.get("userEmail") ?? ""), "owner")) return c.json({ error: "Not found" }, 404);
	const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(mailboxId));
	const attachmentKeys = await stub.purgeAll();
	// R2 delete accepts at most 1000 keys per call.
	for (let i = 0; i < attachmentKeys.length; i += 1000) {
		await c.env.BUCKET.delete(attachmentKeys.slice(i, i + 1000));
	}
	await c.env.BUCKET.delete(key);
	await getAccessStub(c.env).deleteMailbox(mailboxId);
	return c.body(null, 204);
});

// -- Members --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/members", async (c: AppContext) => {
	const mailboxId = normalizeMailboxId(c.req.param("mailboxId")!);
	return c.json(await getAccessStub(c.env).listMembers(mailboxId));
});

app.put("/api/v1/mailboxes/:mailboxId/members", async (c: AppContext) => {
	if (!hasRole(c.var.mailboxRole, "owner")) return c.json({ error: "Only owners can manage members" }, 403);
	const mailboxId = normalizeMailboxId(c.req.param("mailboxId")!);
	const { email, role } = SetMemberBodySchema.parse(await c.req.json());
	const result = await getAccessStub(c.env).setMember(mailboxId, normalizeMailboxId(email), role);
	if (result === "last_owner") return c.json({ error: "A mailbox needs at least one owner" }, 409);
	return c.json({ email: normalizeMailboxId(email), role });
});

app.delete("/api/v1/mailboxes/:mailboxId/members/:email", async (c: AppContext) => {
	if (!hasRole(c.var.mailboxRole, "owner")) return c.json({ error: "Only owners can manage members" }, 403);
	const mailboxId = normalizeMailboxId(c.req.param("mailboxId")!);
	const result = await getAccessStub(c.env).removeMember(mailboxId, normalizeMailboxId(decodeURIComponent(c.req.param("email")!)));
	if (result === "not_found") return c.json({ error: "Member not found" }, 404);
	if (result === "last_owner") return c.json({ error: "A mailbox needs at least one owner" }, 409);
	return c.body(null, 204);
});

// -- Emails ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const folder = c.req.query("folder");
	const thread_id = c.req.query("thread_id");
	const label_id = c.req.query("label");
	const threaded = boolQuery(c, "threaded");
	const page = intQuery(c, "page");
	const limit = intQuery(c, "limit");
	const sortColumn = c.req.query("sortColumn") as GetEmailsOptions["sortColumn"]; // validated against an allow-list in the DO
	const sortDirection = c.req.query("sortDirection") as "ASC" | "DESC" | undefined;
	const stub = c.var.mailboxStub;
	const listStub = stub as unknown as ListStub;

	if (threaded && folder) {
		const emails = await listStub.getThreadedEmails({ folder, page, limit });
		const totalCount = await stub.countThreadedEmails(folder);
		return jsonResponse({ emails, totalCount });
	}
	const emails = await listStub.getEmails({ folder, thread_id, label_id, page, limit, sortColumn, sortDirection });
	if (folder || label_id) {
		const totalCount = await stub.countEmails({ folder, thread_id, label_id });
		return jsonResponse({ emails, totalCount });
	}
	return jsonResponse(emails);
});

app.post("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const body = SendEmailRequestSchema.parse(await c.req.json());
	const { to, cc, bcc, from, subject, html, text, attachments, in_reply_to, references, thread_id } = body;

	let toStr: string, fromEmail: string, fromDomain: string;
	try {
		({ toStr, fromEmail, fromDomain } = validateSender(to, from, mailboxId));
	} catch (e) {
		if (e instanceof SenderValidationError) return c.json({ error: e.message }, 400);
		throw e;
	}

	const { messageId, outgoingMessageId } = generateMessageId(fromDomain);
	const stub = c.var.mailboxStub;
	const rateLimitError = await stub.checkSendRateLimit();
	if (rateLimitError) return c.json({ error: rateLimitError }, 429);

	// Deliver first: a failed send must not leave a message in Sent that nobody received.
	try {
		await getEmailProvider(c.env).send({
			to, cc, bcc, from, subject, html, text,
			attachments: attachments?.map((att) => ({ content: att.content, filename: att.filename, type: att.type, disposition: att.disposition || "attachment", contentId: att.contentId })),
			...(in_reply_to ? { headers: buildThreadingHeaders(in_reply_to, references || []) } : {}),
		});
	} catch (e) {
		console.error("Email delivery failed:", (e as Error).message);
		return c.json({ error: "Email delivery failed" }, 502);
	}

	const attachmentData = await storeAttachments(c.env.BUCKET, messageId, attachments);

	await stub.createEmail(Folders.SENT, {
		id: messageId, subject, sender: fromEmail, recipient: toStr,
		cc: cc ? (Array.isArray(cc) ? cc.join(", ") : cc).toLowerCase() : null,
		bcc: bcc ? (Array.isArray(bcc) ? bcc.join(", ") : bcc).toLowerCase() : null,
		date: new Date().toISOString(), body: html || text || "",
		in_reply_to: in_reply_to || null, email_references: references ? JSON.stringify(references) : null,
		thread_id: thread_id || in_reply_to || messageId, message_id: outgoingMessageId,
		raw_headers: JSON.stringify([
			{ key: "from", value: typeof from === "string" ? from : `${from.name} <${from.email}>` },
			{ key: "to", value: Array.isArray(to) ? to.join(", ") : to },
			...(cc ? [{ key: "cc", value: Array.isArray(cc) ? cc.join(", ") : cc }] : []),
			...(bcc ? [{ key: "bcc", value: Array.isArray(bcc) ? bcc.join(", ") : bcc }] : []),
			{ key: "subject", value: subject }, { key: "date", value: new Date().toISOString() },
			{ key: "message-id", value: `<${outgoingMessageId}>` },
		]),
	}, attachmentData);
	return c.json({ id: messageId, status: "sent" }, 200);
});

app.post("/api/v1/mailboxes/:mailboxId/drafts", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const { to, cc, bcc, subject, body, in_reply_to, thread_id, draft_id } = DraftBody.parse(await c.req.json());
	const stub = c.var.mailboxStub;
	const messageId = crypto.randomUUID();
	const now = new Date().toISOString();
	await stub.createEmail(Folders.DRAFT, {
		id: messageId, subject: subject || "", sender: mailboxId.toLowerCase(),
		recipient: (to || "").toLowerCase(), cc: cc?.toLowerCase() || null, bcc: bcc?.toLowerCase() || null,
		date: now, body, in_reply_to: in_reply_to || null, email_references: null,
		thread_id: thread_id || in_reply_to || messageId,
	}, []);
	// Create-then-delete: a failure here leaves a duplicate draft rather than losing one.
	if (draft_id) await stub.deleteEmail(draft_id);
	return c.json({ id: messageId, status: "draft", subject: subject || "", recipient: to || "", date: now }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const email = await c.var.mailboxStub.getEmail(c.req.param("id")!);
	if (!email) return c.json({ error: "Email not found" }, 404);
	return new Response(JSON.stringify(email), {
		headers: { "Content-Type": "application/json" },
	});
});

app.put("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const { read, starred } = UpdateEmailBodySchema.parse(await c.req.json());
	const email = await c.var.mailboxStub.updateEmail(c.req.param("id")!, { read, starred });
	return email ? c.json(email) : c.json({ error: "Email not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const id = c.req.param("id")!;
	const attachments = await c.var.mailboxStub.deleteEmail(id);
	if (attachments === null) return c.json({ error: "Not found" }, 404);
	await deleteAttachmentObjects(c.env.BUCKET, id, attachments);
	return c.body(null, 204);
});

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/move", async (c: AppContext) => {
	const { folderId } = MoveEmailBodySchema.parse(await c.req.json());
	const success = await c.var.mailboxStub.moveEmail(c.req.param("id")!, folderId);
	return success ? c.json({ status: "moved" }) : c.json({ error: "Folder not found" }, 400);
});

// -- Threads --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/threads/:threadId", async (c: AppContext) => {
	return jsonResponse(await (c.var.mailboxStub as unknown as ListStub).getThreadEmails(c.req.param("threadId")!));
});

app.post("/api/v1/mailboxes/:mailboxId/threads/:threadId/read", async (c: AppContext) => {
	await c.var.mailboxStub.markThreadRead(c.req.param("threadId")!);
	return c.json({ status: "marked_read" });
});

// -- Reply / Forward ------------------------------------------------

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/reply", handleReplyEmail);
app.post("/api/v1/mailboxes/:mailboxId/emails/:id/forward", handleForwardEmail);

// -- Labels ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/labels", async (c: AppContext) => c.json(await c.var.mailboxStub.listLabels()));

app.post("/api/v1/mailboxes/:mailboxId/labels", async (c: AppContext) => {
	const { name, color } = LabelBodySchema.parse(await c.req.json());
	const label = await c.var.mailboxStub.createLabel(name, color);
	return label ? c.json(label, 201) : c.json({ error: "A label with this name already exists" }, 409);
});

app.put("/api/v1/mailboxes/:mailboxId/labels/:id", async (c: AppContext) => {
	const patch = UpdateLabelBodySchema.parse(await c.req.json());
	const result = await c.var.mailboxStub.updateLabel(c.req.param("id")!, patch);
	if (result === "conflict") return c.json({ error: "A label with this name already exists" }, 409);
	return result ? c.json(result) : c.json({ error: "Label not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/labels/:id", async (c: AppContext) => {
	const ok = await c.var.mailboxStub.deleteLabel(c.req.param("id")!);
	return ok ? c.body(null, 204) : c.json({ error: "Label not found" }, 404);
});

app.get("/api/v1/mailboxes/:mailboxId/emails/:id/labels", async (c: AppContext) =>
	c.json(await c.var.mailboxStub.getEmailLabels(c.req.param("id")!)),
);

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/labels", async (c: AppContext) => {
	const { labelId } = EmailLabelBodySchema.parse(await c.req.json());
	const ok = await c.var.mailboxStub.addEmailLabel(c.req.param("id")!, labelId);
	return ok ? c.json({ status: "labeled" }) : c.json({ error: "Email or label not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:id/labels/:labelId", async (c: AppContext) => {
	await c.var.mailboxStub.removeEmailLabel(c.req.param("id")!, c.req.param("labelId")!);
	return c.body(null, 204);
});

// -- Filter rules ---------------------------------------------------

/** Reject rules that point at a label or folder that does not exist. */
async function validateFilterRefs(c: AppContext, actions: { labelId?: string; moveTo?: string }) {
	const stub = c.var.mailboxStub;
	if (actions.labelId && !(await stub.listLabels()).some((l) => l.id === actions.labelId)) return "Unknown label";
	if (actions.moveTo && !(await stub.getFolders()).some((f) => f.id === actions.moveTo)) return "Unknown folder";
	return null;
}

app.get("/api/v1/mailboxes/:mailboxId/filters", async (c: AppContext) => c.json(await c.var.mailboxStub.listFilterRules()));

app.post("/api/v1/mailboxes/:mailboxId/filters", async (c: AppContext) => {
	if (!hasRole(c.var.mailboxRole, "owner")) return c.json({ error: "Only owners can manage filters" }, 403);
	const body = FilterRuleBodySchema.parse(await c.req.json());
	const refError = await validateFilterRefs(c, body.actions);
	if (refError) return c.json({ error: refError }, 400);
	return c.json(await c.var.mailboxStub.createFilterRule(body), 201);
});

app.put("/api/v1/mailboxes/:mailboxId/filters/:id", async (c: AppContext) => {
	if (!hasRole(c.var.mailboxRole, "owner")) return c.json({ error: "Only owners can manage filters" }, 403);
	const body = FilterRuleBodySchema.parse(await c.req.json());
	const refError = await validateFilterRefs(c, body.actions);
	if (refError) return c.json({ error: refError }, 400);
	const rule = await c.var.mailboxStub.updateFilterRule(c.req.param("id")!, body);
	return rule ? c.json(rule) : c.json({ error: "Filter not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/filters/:id", async (c: AppContext) => {
	if (!hasRole(c.var.mailboxRole, "owner")) return c.json({ error: "Only owners can manage filters" }, 403);
	const ok = await c.var.mailboxStub.deleteFilterRule(c.req.param("id")!);
	return ok ? c.body(null, 204) : c.json({ error: "Filter not found" }, 404);
});

// -- Folders --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => c.json(await c.var.mailboxStub.getFolders()));

app.post("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => {
	const { name } = FolderNameBodySchema.parse(await c.req.json());
	const slug = slugify(name);
	if (!slug) return c.json({ error: "Folder name must contain alphanumeric characters" }, 400);
	const f = await c.var.mailboxStub.createFolder(slug, name);
	return f ? c.json(f, 201) : c.json({ error: "Folder with this name already exists" }, 409);
});

app.put("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const { name } = FolderNameBodySchema.parse(await c.req.json());
	const f = await c.var.mailboxStub.updateFolder(c.req.param("id")!, name);
	return f ? c.json(f) : c.json({ error: "Folder not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const ok = await c.var.mailboxStub.deleteFolder(c.req.param("id")!);
	return ok ? c.body(null, 204) : c.json({ error: "Folder not found or cannot be deleted" }, 400);
});

// -- Search ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/search", async (c: AppContext) => {
	const searchOpts: SearchFilterOptions = {
		query: c.req.query("query") || "", folder: c.req.query("folder"), from: c.req.query("from"),
		to: c.req.query("to"), subject: c.req.query("subject"), date_start: c.req.query("date_start"),
		date_end: c.req.query("date_end"), is_read: boolQuery(c, "is_read"),
		is_starred: boolQuery(c, "is_starred"), has_attachment: boolQuery(c, "has_attachment"),
	};
	const stub = c.var.mailboxStub;
	const emails = await (stub as unknown as ListStub).searchEmails({ ...searchOpts, page: intQuery(c, "page"), limit: intQuery(c, "limit") });
	const totalCount = await stub.countSearchResults(searchOpts);
	return jsonResponse({ emails, totalCount });
});

// -- Attachments ----------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails/:emailId/attachments/:attachmentId", async (c: AppContext) => {
	const emailId = c.req.param("emailId")!;
	const attachmentId = c.req.param("attachmentId")!;
	const attachment = await c.var.mailboxStub.getAttachment(attachmentId);
	if (!attachment) return c.json({ error: "Attachment not found" }, 404);
	const obj = await c.env.BUCKET.get(`attachments/${emailId}/${attachmentId}/${attachment.filename}`);
	if (!obj) return c.json({ error: "Attachment file not found" }, 404);
	const headers = new Headers();
	headers.set("Content-Type", attachment.mimetype);
	const sanitized = attachment.filename.replace(/[\x00-\x1f"\\]/g, "_");
	headers.set("Content-Disposition", `attachment; filename="${sanitized}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`);
	return new Response(obj.body, { headers });
});

// -- Receive inbound email ------------------------------------------

const MAX_EMAIL_SIZE = 25 * 1024 * 1024;

async function streamToArrayBuffer(stream: ReadableStream, streamSize: number) {
	if (streamSize > MAX_EMAIL_SIZE) throw new Error(`Email too large: ${streamSize} bytes exceeds ${MAX_EMAIL_SIZE} byte limit`);
	if (streamSize <= 0) throw new Error(`Invalid stream size: ${streamSize}`);
	const result = new Uint8Array(streamSize);
	let bytesRead = 0;
	const reader = stream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (bytesRead + value.length > streamSize) { reader.cancel(); throw new Error(`Stream exceeds declared size`); }
		result.set(value, bytesRead);
		bytesRead += value.length;
	}
	return result;
}

async function receiveEmail(event: { raw: ReadableStream; rawSize: number }, env: Env, ctx: ExecutionContext) {
	const rawEmail = await streamToArrayBuffer(event.raw, event.rawSize);
	const parsedEmail = await new PostalMime().parse(rawEmail);

	if (!parsedEmail.to?.length || !parsedEmail.to[0].address) throw new Error("received email with empty to");

	const allowedAddresses = ((env.EMAIL_ADDRESSES ?? []) as string[]).map((a) => a.toLowerCase());
	const allRecipients = parsedEmail.to.map((t) => t.address?.toLowerCase()).filter(Boolean) as string[];
	const ccRecipients = (parsedEmail.cc || []).map((e) => e.address?.toLowerCase()).filter(Boolean) as string[];
	const bccRecipients = (parsedEmail.bcc || []).map((e) => e.address?.toLowerCase()).filter(Boolean) as string[];

	let mailboxId: string | undefined;
	if (allowedAddresses.length > 0) {
		mailboxId = allRecipients.find((addr) => allowedAddresses.includes(addr));
		if (!mailboxId) { console.log(`Ignoring email: no recipient matches EMAIL_ADDRESSES.`); return; }
	} else { mailboxId = allRecipients[0]; }
	if (!mailboxId) throw new Error("received email with no valid recipient address");

	const messageId = crypto.randomUUID();
	if (!(await env.BUCKET.head(`mailboxes/${mailboxId}.json`))) { console.log(`Ignoring email for ${mailboxId}: mailbox does not exist`); return; }

	const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));

	const attachmentData: StoredAttachment[] = [];
	if (parsedEmail.attachments) {
		for (const att of parsedEmail.attachments) {
			const attId = crypto.randomUUID();
			const filename = (att.filename || "untitled").replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_");
			await env.BUCKET.put(`attachments/${messageId}/${attId}/${filename}`, att.content);
			attachmentData.push({ id: attId, email_id: messageId, filename, mimetype: att.mimeType,
				size: typeof att.content === "string" ? att.content.length : att.content.byteLength,
				content_id: att.contentId || null, disposition: att.disposition || "attachment" });
		}
	}

	const extractMsgId = (s: string) => { const m = s.match(/<([^>]+)>/); return m ? m[1] : s.trim().split(/\s+/)[0]; };
	const inReplyTo = parsedEmail.inReplyTo ? extractMsgId(parsedEmail.inReplyTo) : null;
	const emailReferences = parsedEmail.references ? parsedEmail.references.split(/\s+/).filter(Boolean).map(extractMsgId) : [];
	let threadId = emailReferences[0] || inReplyTo || messageId;

	if (!inReplyTo && emailReferences.length === 0) {
		const subjectThread = await stub.findThreadBySubject(parsedEmail.subject || "", parsedEmail.from?.address || undefined);
		if (subjectThread) threadId = subjectThread;
	}

	const originalMessageId = parsedEmail.messageId ? extractMsgId(parsedEmail.messageId) : null;

	await stub.createEmail(Folders.INBOX, {
		id: messageId, subject: parsedEmail.subject || "",
		sender: (parsedEmail.from?.address || "").toLowerCase(), recipient: allRecipients.join(", "),
		cc: ccRecipients.join(", ") || null, bcc: bccRecipients.join(", ") || null,
		date: new Date().toISOString(), // uses receive time, not the email's Date header
		body: parsedEmail.html || parsedEmail.text || "",
		in_reply_to: inReplyTo, email_references: emailReferences.length > 0 ? JSON.stringify(emailReferences) : null,
		thread_id: threadId, message_id: originalMessageId, raw_headers: JSON.stringify(parsedEmail.headers),
	}, attachmentData);

	// A filter may have moved the mail out of the inbox (e.g. to trash); don't auto-draft for those.
	const filtered = await stub.applyFilters(messageId).catch((e: Error) => {
		console.error("Filter rules failed:", e.message);
		return { applied: false } as { applied: boolean; movedTo?: string };
	});
	if (filtered.movedTo && filtered.movedTo !== Folders.INBOX) return;

	const agentStub = env.EMAIL_AGENT.get(env.EMAIL_AGENT.idFromName(mailboxId));
	ctx.waitUntil(agentStub.fetch(new Request("https://agents/onNewEmail", {
		method: "POST", headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ mailboxId, emailId: messageId, sender: (parsedEmail.from?.address || "").toLowerCase(), subject: parsedEmail.subject || "", threadId }),
	})).catch((e) => console.error("Auto-draft trigger failed:", (e as Error).message)));
}

export { app, receiveEmail };
