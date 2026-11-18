// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, useKumoToastManager } from "@cloudflare/kumo";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getDefaultSignature, listSignatures, MAX_SIGNATURES, newSignatureId, type Signature } from "shared/signatures";
import { escapeHtml, htmlToPlainText, signatureToBlock } from "~/lib/utils";
import { useUpdateMailbox } from "~/queries/mailboxes";
import type { Mailbox } from "~/types";
import RichTextEditor from "./RichTextEditor";

/** Plain-text signatures are edited as simple paragraphs. */
const textToHtml = (text: string) =>
	text
		.split("\n")
		.map((line) => `<p>${escapeHtml(line)}</p>`)
		.join("");

interface Draft {
	id: string | null; // null while creating
	name: string;
	html: string;
}

/** Create, edit, delete and choose the default among a mailbox's signatures. */
export default function SignaturesCard({ mailbox }: { mailbox: Mailbox }) {
	const { t } = useTranslation("settings");
	const toast = useKumoToastManager();
	const update = useUpdateMailbox();
	const signatures = listSignatures(mailbox.settings);
	const defaultId = getDefaultSignature(mailbox.settings)?.id;
	const [draft, setDraft] = useState<Draft | null>(null);
	const [error, setError] = useState<string | null>(null);

	/** Persist the list; also retires the legacy single `signature` field. */
	const persist = async (next: Signature[], nextDefault: string | undefined) => {
		try {
			await update.mutateAsync({
				mailboxId: mailbox.id,
				settings: { ...mailbox.settings, signature: undefined, signatures: next, defaultSignatureId: nextDefault },
			});
			return true;
		} catch {
			toast.add({ title: t("signatures.saveFailed"), variant: "error" });
			return false;
		}
	};

	const handleSave = async () => {
		if (!draft) return;
		const name = draft.name.trim();
		if (!name) return setError(t("signatures.errors.nameRequired"));
		if (signatures.some((s) => s.id !== draft.id && s.name.trim().toLowerCase() === name.toLowerCase())) {
			return setError(t("signatures.errors.nameTaken"));
		}
		const text = htmlToPlainText(draft.html).trim();
		if (!text) return setError(t("signatures.errors.contentRequired"));

		const saved: Signature = { id: draft.id ?? newSignatureId(), name, text, html: draft.html };
		const next = draft.id ? signatures.map((s) => (s.id === draft.id ? saved : s)) : [...signatures, saved];
		// The first signature becomes the default so it is used straight away.
		if (await persist(next, defaultId ?? (signatures.length === 0 ? saved.id : undefined))) {
			setDraft(null);
			setError(null);
		}
	};

	const handleDelete = (sig: Signature) => {
		if (!window.confirm(t("signatures.confirmDelete", { name: sig.name }))) return;
		void persist(signatures.filter((s) => s.id !== sig.id), sig.id === defaultId ? undefined : defaultId);
	};

	return (
		<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
			<div className="text-sm font-medium text-kumo-default mb-1">{t("signatures.title")}</div>
			<p className="text-xs text-kumo-subtle mb-4">{t("signatures.description")}</p>

			{signatures.length === 0 && !draft && <p className="text-xs text-kumo-subtle mb-4">{t("signatures.empty")}</p>}

			<ul className="space-y-3 mb-4">
				{signatures.map((s) => (
					<li key={s.id} className="rounded-lg border border-kumo-line p-3">
						<div className="flex items-center justify-between gap-2">
							<span className="flex items-center gap-2 text-sm text-kumo-default">
								{s.name}
								{s.id === defaultId && <Badge variant="primary">{t("signatures.default")}</Badge>}
							</span>
							<span className="flex shrink-0 gap-1">
								<Button
									variant="ghost"
									size="xs"
									onClick={() => persist(signatures, s.id === defaultId ? undefined : s.id)}
								>
									{s.id === defaultId ? t("signatures.clearDefault") : t("signatures.setDefault")}
								</Button>
								<Button variant="ghost" size="xs" onClick={() => setDraft({ id: s.id, name: s.name, html: s.html ?? textToHtml(s.text) })}>
									{t("signatures.edit")}
								</Button>
								<Button variant="ghost" size="xs" onClick={() => handleDelete(s)}>
									{t("signatures.delete")}
								</Button>
							</span>
						</div>
						<div
							className="mt-2 text-xs text-kumo-subtle line-clamp-3"
							// Sanitized by signatureToBlock (DOMPurify / escaped text).
							dangerouslySetInnerHTML={{ __html: signatureToBlock(s) }}
						/>
					</li>
				))}
			</ul>

			{draft ? (
				<div className="space-y-3">
					<Input label={t("signatures.name")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
					<div className="h-48 rounded-lg border border-kumo-line">
						<RichTextEditor value={draft.html} onChange={(html) => setDraft((d) => (d ? { ...d, html } : d))} />
					</div>
					{error && <p role="alert" className="text-sm text-red-600">{error}</p>}
					<div className="flex gap-2">
						<Button variant="primary" size="sm" onClick={handleSave} loading={update.isPending}>
							{t("signatures.save")}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setDraft(null);
								setError(null);
							}}
						>
							{t("actions.cancel", { ns: "common" })}
						</Button>
					</div>
				</div>
			) : (
				<Button
					variant="secondary"
					size="sm"
					disabled={signatures.length >= MAX_SIGNATURES}
					onClick={() => setDraft({ id: null, name: "", html: "" })}
				>
					{t("signatures.add")}
				</Button>
			)}
		</div>
	);
}
