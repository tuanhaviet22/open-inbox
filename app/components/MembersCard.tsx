// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, useKumoToastManager } from "@cloudflare/kumo";
import { useState } from "react";
import { useMembers, useRemoveMember, useSetMember } from "~/queries/members";

/** Lists the people who can use a mailbox. Only rendered for owners/admins. */
export default function MembersCard({ mailboxId }: { mailboxId: string }) {
	const toast = useKumoToastManager();
	const { data: members = [] } = useMembers(mailboxId);
	const setMember = useSetMember(mailboxId);
	const removeMember = useRemoveMember(mailboxId);
	const [email, setEmail] = useState("");

	const onError = (e: unknown) =>
		toast.add({ title: e instanceof Error ? e.message : "Request failed", variant: "error" });

	const handleAdd = () => {
		const value = email.trim();
		if (!value) return;
		setMember.mutate(
			{ email: value, role: "member" },
			{ onSuccess: () => setEmail(""), onError },
		);
	};

	return (
		<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
			<div className="text-sm font-medium text-kumo-default mb-4">Members</div>
			<ul className="space-y-2 mb-4">
				{members.map((m) => (
					<li key={m.email} className="flex items-center justify-between gap-2 text-sm">
						<span className="truncate text-kumo-default">{m.email}</span>
						<span className="flex items-center gap-2">
							<Badge variant={m.role === "owner" ? "primary" : "secondary"}>{m.role}</Badge>
							<Button
								variant="ghost"
								size="xs"
								onClick={() =>
									setMember.mutate(
										{ email: m.email, role: m.role === "owner" ? "member" : "owner" },
										{ onError },
									)
								}
							>
								{m.role === "owner" ? "Make member" : "Make owner"}
							</Button>
							<Button variant="ghost" size="xs" onClick={() => removeMember.mutate(m.email, { onError })}>
								Remove
							</Button>
						</span>
					</li>
				))}
			</ul>
			<div className="flex items-end gap-2">
				<div className="flex-1">
					<Input
						label="Add member by email"
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
				</div>
				<Button variant="primary" onClick={handleAdd} loading={setMember.isPending}>
					Add
				</Button>
			</div>
		</div>
	);
}
