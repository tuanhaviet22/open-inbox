// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useTranslation } from "react-i18next";
import { useEmailLabels, useLabels, useToggleEmailLabel } from "~/queries/labels";

/** Label chips for one email; clicking a chip toggles that label. */
export default function EmailLabels({ mailboxId, emailId }: { mailboxId: string; emailId: string }) {
	const { t } = useTranslation("mailbox");
	const { data: all = [] } = useLabels(mailboxId);
	const { data: applied = [] } = useEmailLabels(mailboxId, emailId);
	const toggle = useToggleEmailLabel(mailboxId, emailId);
	if (all.length === 0) return null;
	const on = new Set(applied.map((l) => l.id));

	return (
		<div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-kumo-line" aria-label={t("panel.labels")}>
			{all.map((l) => {
				const active = on.has(l.id);
				return (
					<button
						key={l.id}
						type="button"
						aria-pressed={active}
						onClick={() => toggle.mutate({ labelId: l.id, on: !active })}
						className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
							active ? "text-white" : "border-kumo-line text-kumo-subtle"
						}`}
						style={active ? { backgroundColor: l.color, borderColor: l.color } : undefined}
					>
						{!active && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />}
						{l.name}
					</button>
				);
			})}
		</div>
	);
}
