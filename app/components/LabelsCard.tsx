// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, useKumoToastManager } from "@cloudflare/kumo";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateLabel, useDeleteLabel, useLabels } from "~/queries/labels";

const COLORS = ["#6b7280", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];

/** Create and delete the labels of a mailbox. */
export default function LabelsCard({ mailboxId }: { mailboxId: string }) {
	const { t } = useTranslation("settings");
	const toast = useKumoToastManager();
	const { data: labels = [] } = useLabels(mailboxId);
	const createLabel = useCreateLabel(mailboxId);
	const deleteLabel = useDeleteLabel(mailboxId);
	const [name, setName] = useState("");
	const [color, setColor] = useState(COLORS[0]);

	const onError = (e: unknown) =>
		toast.add({ title: e instanceof Error ? e.message : t("labels.error"), variant: "error" });

	const handleAdd = () => {
		const value = name.trim();
		if (!value) return;
		createLabel.mutate({ name: value, color }, { onSuccess: () => setName(""), onError });
	};

	return (
		<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
			<div className="text-sm font-medium text-kumo-default mb-4">{t("labels.title")}</div>
			{labels.length === 0 ? (
				<p className="text-xs text-kumo-subtle mb-4">{t("labels.empty")}</p>
			) : (
				<ul className="flex flex-wrap gap-2 mb-4">
					{labels.map((l) => (
						<li
							key={l.id}
							className="flex items-center gap-1 rounded-full border border-kumo-line px-2 py-0.5 text-xs text-kumo-default"
						>
							<span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
							{l.name}
							<button
								type="button"
								className="ml-1 text-kumo-subtle hover:text-kumo-default"
								aria-label={t("labels.delete", { name: l.name })}
								onClick={() => deleteLabel.mutate(l.id, { onError })}
							>
								×
							</button>
						</li>
					))}
				</ul>
			)}
			<div className="flex items-end gap-2">
				<div className="flex-1">
					<Input label={t("labels.name")} value={name} onChange={(e) => setName(e.target.value)} />
				</div>
				<div className="flex items-center gap-1 pb-2" role="radiogroup" aria-label={t("labels.color")}>
					{COLORS.map((c) => (
						<button
							key={c}
							type="button"
							role="radio"
							aria-checked={c === color}
							aria-label={c}
							onClick={() => setColor(c)}
							className={`h-4 w-4 rounded-full ${c === color ? "ring-2 ring-kumo-ring ring-offset-1" : ""}`}
							style={{ backgroundColor: c }}
						/>
					))}
				</div>
				<Button variant="primary" onClick={handleAdd} loading={createLabel.isPending}>
					{t("labels.add")}
				</Button>
			</div>
		</div>
	);
}
