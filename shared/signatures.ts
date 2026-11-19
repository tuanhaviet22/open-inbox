// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Email signatures. A mailbox can hold several; one may be the default that is
 * added to new messages, replies and forwards. Older mailboxes stored a single
 * `signature` object, which is still read (as one signature) until the mailbox
 * is saved from the new Settings screen.
 */
export interface Signature {
	id: string;
	name: string;
	text: string;
	html?: string;
}

export interface SignatureSettings {
	signatures?: Signature[];
	defaultSignatureId?: string;
	/** Legacy single signature. */
	signature?: { enabled: boolean; text?: string; html?: string };
}

export const MAX_SIGNATURES = 20;
export const LEGACY_SIGNATURE_ID = "default";

export function listSignatures(settings: SignatureSettings | null | undefined): Signature[] {
	if (!settings) return [];
	if (settings.signatures) return settings.signatures;
	const legacy = settings.signature;
	if (legacy?.enabled && (legacy.html || legacy.text)) {
		return [{ id: LEGACY_SIGNATURE_ID, name: "Default", text: legacy.text ?? "", html: legacy.html }];
	}
	return [];
}

/** The signature added automatically to new compositions, if any. */
export function getDefaultSignature(settings: SignatureSettings | null | undefined): Signature | null {
	const all = listSignatures(settings);
	if (settings?.signatures) return all.find((s) => s.id === settings.defaultSignatureId) ?? null;
	return all[0] ?? null; // legacy: the single signature is the default
}

export function newSignatureId(): string {
	return crypto.randomUUID();
}

/** Problems that make a signature list invalid, or null when it is fine. */
export function validateSignatures(settings: Pick<SignatureSettings, "signatures" | "defaultSignatureId">): string | null {
	const list = settings.signatures ?? [];
	if (list.length > MAX_SIGNATURES) return `At most ${MAX_SIGNATURES} signatures`;
	const ids = new Set(list.map((s) => s.id));
	if (ids.size !== list.length) return "Signature ids must be unique";
	const names = new Set(list.map((s) => s.name.trim().toLowerCase()));
	if (names.size !== list.length) return "Signature names must be unique";
	if (settings.defaultSignatureId && !ids.has(settings.defaultSignatureId)) return "Default signature does not exist";
	return null;
}

/**
 * True when plain text is really HTML source, e.g. someone pasted the markup of
 * an email signature into a visual editor and it was stored as escaped text.
 */
export function looksLikeHtmlSource(text: string): boolean {
	return /^\s*<([a-z][a-z0-9]*)(\s[^>]*)?>/i.test(text) && /<\/[a-z][a-z0-9]*\s*>/i.test(text);
}

/** HTML a visual editor would mangle: tables, images, or inline styles. */
export function isComplexHtml(html: string): boolean {
	return /<(table|img|td|tr)\b|\sstyle\s*=/i.test(html);
}
