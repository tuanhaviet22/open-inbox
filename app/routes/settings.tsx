// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, Select, useKumoToastManager } from "@cloudflare/kumo";
import { RobotIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { LOCALE_NAMES, SUPPORTED_LOCALES, type Locale } from "../../shared/locales";
import FiltersCard from "~/components/FiltersCard";
import LabelsCard from "~/components/LabelsCard";
import MembersCard from "~/components/MembersCard";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import { useMe, useMembers } from "~/queries/members";

// Placeholder shown in the textarea when no custom prompt is set.
// The authoritative default prompt lives in workers/agent/index.ts (DEFAULT_SYSTEM_PROMPT).
const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const { t } = useTranslation("settings");
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();
	const { data: me } = useMe();
	const { data: members = [] } = useMembers(mailboxId);
	const canManageMembers =
		!!me?.authzEnabled &&
		(me.isAdmin || members.some((m) => m.email === me.email && m.role === "owner"));

	const [displayName, setDisplayName] = useState("");
	const [agentPrompt, setAgentPrompt] = useState("");
	const [outgoingLocale, setOutgoingLocale] = useState<Locale | "">("");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
			setOutgoingLocale((mailbox.settings?.locale as Locale | undefined) || "");
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		const { locale: _omit, ...rest } = mailbox.settings ?? {};
		const settings = {
			...rest,
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
			...(outgoingLocale ? { locale: outgoingLocale } : {}),
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: t("toast.saved") });
		} catch {
			toastManager.add({
				title: t("toast.saveFailed"),
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleResetPrompt = () => {
		setAgentPrompt("");
	};

	if (!mailbox) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">{t("title")}</h1>

			<div className="space-y-6">
				{/* Account */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">
						{t("account.title")}
					</div>
					<div className="space-y-3">
						<Input
							label={t("account.displayName")}
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<Input label={t("account.email")} type="email" value={mailbox.email} disabled />
					</div>
				</div>

				{/* Outgoing email language */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<Select
						label={t("outgoingLanguage.label")}
						value={outgoingLocale || "auto"}
						onValueChange={(value) =>
							setOutgoingLocale(value === "auto" || !value ? "" : (value as Locale))
						}
					>
						<Select.Option value="auto">{t("outgoingLanguage.auto")}</Select.Option>
						{SUPPORTED_LOCALES.map((l) => (
							<Select.Option key={l} value={l}>
								{LOCALE_NAMES[l]}
							</Select.Option>
						))}
					</Select>
					<p className="text-xs text-kumo-subtle mt-2">{t("outgoingLanguage.description")}</p>
				</div>

				{canManageMembers && <MembersCard mailboxId={mailboxId!} />}

				<LabelsCard mailboxId={mailboxId!} />
				<FiltersCard mailboxId={mailboxId!} />

				{/* Agent System Prompt */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">
								{t("agent.title")}
							</span>
							{isCustomPrompt ? (
								<Badge variant="primary">{t("agent.custom")}</Badge>
							) : (
								<Badge variant="secondary">{t("agent.default")}</Badge>
							)}
						</div>
						{isCustomPrompt && (
							<Button
								variant="ghost"
								size="xs"
								icon={<ArrowCounterClockwiseIcon size={14} />}
								onClick={handleResetPrompt}
							>
								{t("agent.reset")}
							</Button>
						)}
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						{t("agent.description")}
					</p>
					<textarea
						value={agentPrompt}
						onChange={(e) => setAgentPrompt(e.target.value)}
						placeholder={PROMPT_PLACEHOLDER}
						rows={12}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
					/>
					<p className="text-xs text-kumo-subtle mt-2">
						{t("agent.hint")}
					</p>
				</div>

				{/* Save */}
				<div className="flex justify-end">
					<Button variant="primary" onClick={handleSave} loading={isSaving}>
						{t("saveChanges")}
					</Button>
				</div>
			</div>
		</div>
	);
}
