// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, useKumoToastManager } from "@cloudflare/kumo";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFolderName } from "~/hooks/useFolderName";
import { useFolders } from "~/queries/folders";
import { useDeleteFilter, useFilters, useLabels, useSaveFilter } from "~/queries/labels";
import type { FilterRuleInput } from "~/types";

const EMPTY = { name: "", from: "", subject: "", contains: "", labelId: "", moveTo: "", markRead: false, star: false };

const selectClass =
	"w-full rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-sm text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-ring";

/** Rules applied to every new inbound email, e.g. "from billing@ -> label Invoices". */
export default function FiltersCard({ mailboxId }: { mailboxId: string }) {
	const { t } = useTranslation("settings");
	const toast = useKumoToastManager();
	const folderName = useFolderName();
	const { data: filters = [] } = useFilters(mailboxId);
	const { data: labels = [] } = useLabels(mailboxId);
	const { data: folders = [] } = useFolders(mailboxId);
	const saveFilter = useSaveFilter(mailboxId);
	const deleteFilter = useDeleteFilter(mailboxId);
	const [form, setForm] = useState(EMPTY);
	const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

	const onError = (e: unknown) =>
		toast.add({ title: e instanceof Error ? e.message : t("filters.error"), variant: "error" });

	const describe = (r: (typeof filters)[number]) => {
		const when = Object.entries(r.conditions)
			.map(([k, v]) => `${t(`filters.fields.${k}`)}: ${v}`)
			.join(", ");
		const then = [
			r.actions.labelId && `${t("filters.actions.label")}: ${labels.find((l) => l.id === r.actions.labelId)?.name ?? "?"}`,
			r.actions.moveTo && `${t("filters.actions.move")}: ${folderName(r.actions.moveTo, folders.find((f) => f.id === r.actions.moveTo)?.name)}`,
			r.actions.markRead && t("filters.actions.markRead"),
			r.actions.star && t("filters.actions.star"),
		]
			.filter(Boolean)
			.join(", ");
		return `${when} → ${then}`;
	};

	const handleAdd = () => {
		const conditions = Object.fromEntries(
			(["from", "subject", "contains"] as const).map((k) => [k, form[k].trim()]).filter(([, v]) => v),
		);
		const actions = {
			...(form.labelId ? { labelId: form.labelId } : {}),
			...(form.moveTo ? { moveTo: form.moveTo } : {}),
			...(form.markRead ? { markRead: true } : {}),
			...(form.star ? { star: true } : {}),
		};
		if (!form.name.trim() || Object.keys(conditions).length === 0 || Object.keys(actions).length === 0) {
			toast.add({ title: t("filters.incomplete"), variant: "error" });
			return;
		}
		const rule: FilterRuleInput = { name: form.name.trim(), enabled: true, conditions, actions };
		saveFilter.mutate({ rule }, { onSuccess: () => setForm(EMPTY), onError });
	};

	return (
		<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
			<div className="text-sm font-medium text-kumo-default mb-1">{t("filters.title")}</div>
			<p className="text-xs text-kumo-subtle mb-4">{t("filters.description")}</p>
			<ul className="space-y-2 mb-4">
				{filters.map((r) => (
					<li key={r.id} className="flex items-center justify-between gap-2 text-sm">
						<span className="min-w-0">
							<span className="text-kumo-default">{r.name}</span>
							<span className="block truncate text-xs text-kumo-subtle">{describe(r)}</span>
						</span>
						<span className="flex shrink-0 gap-1">
							<Button
								variant="ghost"
								size="xs"
								onClick={() =>
									saveFilter.mutate(
										{ id: r.id, rule: { name: r.name, enabled: !r.enabled, conditions: r.conditions, actions: r.actions } },
										{ onError },
									)
								}
							>
								{r.enabled ? t("filters.disable") : t("filters.enable")}
							</Button>
							<Button variant="ghost" size="xs" onClick={() => deleteFilter.mutate(r.id, { onError })}>
								{t("filters.delete")}
							</Button>
						</span>
					</li>
				))}
			</ul>
			<div className="space-y-3">
				<Input label={t("filters.name")} value={form.name} onChange={(e) => set({ name: e.target.value })} />
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<Input label={t("filters.fields.from")} value={form.from} onChange={(e) => set({ from: e.target.value })} />
					<Input label={t("filters.fields.subject")} value={form.subject} onChange={(e) => set({ subject: e.target.value })} />
					<Input label={t("filters.fields.contains")} value={form.contains} onChange={(e) => set({ contains: e.target.value })} />
				</div>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<label className="text-xs text-kumo-subtle">
						{t("filters.actions.label")}
						<select className={selectClass} value={form.labelId} onChange={(e) => set({ labelId: e.target.value })}>
							<option value="">{t("filters.none")}</option>
							{labels.map((l) => (
								<option key={l.id} value={l.id}>
									{l.name}
								</option>
							))}
						</select>
					</label>
					<label className="text-xs text-kumo-subtle">
						{t("filters.actions.move")}
						<select className={selectClass} value={form.moveTo} onChange={(e) => set({ moveTo: e.target.value })}>
							<option value="">{t("filters.none")}</option>
							{folders.map((f) => (
								<option key={f.id} value={f.id}>
									{folderName(f.id, f.name)}
								</option>
							))}
						</select>
					</label>
				</div>
				<div className="flex items-center gap-4 text-sm text-kumo-default">
					<label className="flex items-center gap-1">
						<input type="checkbox" checked={form.markRead} onChange={(e) => set({ markRead: e.target.checked })} />
						{t("filters.actions.markRead")}
					</label>
					<label className="flex items-center gap-1">
						<input type="checkbox" checked={form.star} onChange={(e) => set({ star: e.target.checked })} />
						{t("filters.actions.star")}
					</label>
					<span className="ml-auto">
						<Button variant="primary" onClick={handleAdd} loading={saveFilter.isPending}>
							{t("filters.add")}
						</Button>
					</span>
				</div>
			</div>
		</div>
	);
}
