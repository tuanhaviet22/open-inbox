// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useCreateUser, useDeleteUser, useSetUserPassword, useUsers } from "~/queries/admin";
import { useMe } from "~/queries/members";
import UserMenu from "~/components/UserMenu";

export default function AdminUsersRoute() {
	const { t } = useTranslation("auth");
	const toast = useKumoToastManager();
	const { data: me } = useMe();
	const { data: users = [], isLoading } = useUsers();
	const createUser = useCreateUser();
	const setPassword = useSetUserPassword();
	const deleteUser = useDeleteUser();
	const [form, setForm] = useState({ email: "", name: "", password: "" });

	const onError = (e: unknown) => toast.add({ title: e instanceof Error ? e.message : t("admin.error"), variant: "error" });

	if (!me || isLoading) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}
	if (!me.isAdmin || me.authMode !== "password") {
		return <p className="p-8 text-sm text-kumo-subtle">{t("admin.forbidden")}</p>;
	}

	const handleAdd = () => {
		if (!form.email.trim() || !form.password) return;
		createUser.mutate(
			{ email: form.email.trim(), name: form.name.trim() || undefined, password: form.password },
			{ onSuccess: () => setForm({ email: "", name: "", password: "" }), onError },
		);
	};

	const handleReset = (id: string, email: string) => {
		const password = window.prompt(t("admin.newPasswordFor", { email }));
		if (password) setPassword.mutate({ id, password }, { onSuccess: () => toast.add({ title: t("admin.passwordSet") }), onError });
	};

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-lg font-semibold text-kumo-default">{t("admin.title")}</h1>
				<UserMenu />
			</div>
			<ul className="space-y-2 rounded-lg border border-kumo-line bg-kumo-base p-5">
				{users.map((u) => (
					<li key={u.id} className="flex items-center justify-between gap-2 text-sm">
						<span className="min-w-0 truncate text-kumo-default">{u.email}</span>
						<span className="flex shrink-0 gap-1">
							<Button variant="ghost" size="xs" onClick={() => handleReset(u.id, u.email)}>
								{t("admin.resetPassword")}
							</Button>
							{u.email.toLowerCase() !== me.email && (
								<Button
									variant="ghost"
									size="xs"
									onClick={() => window.confirm(t("admin.confirmDelete", { email: u.email })) && deleteUser.mutate(u.id, { onError })}
								>
									{t("admin.delete")}
								</Button>
							)}
						</span>
					</li>
				))}
			</ul>
			<div className="rounded-lg border border-kumo-line bg-kumo-base p-5 space-y-3">
				<div className="text-sm font-medium text-kumo-default">{t("admin.add")}</div>
				<Input label={t("fields.email")} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
				<Input label={t("fields.name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
				<Input label={t("admin.initialPassword")} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
				<p className="text-xs text-kumo-subtle">{t("password.tooShort", { count: 10 })}</p>
				<Button variant="primary" onClick={handleAdd} loading={createUser.isPending}>
					{t("admin.addSubmit")}
				</Button>
			</div>
		</div>
	);
}
