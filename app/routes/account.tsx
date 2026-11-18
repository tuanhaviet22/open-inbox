// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { authClient } from "~/lib/auth-client";
import { useApiKeys, useCreateApiKey, useDeleteApiKey } from "~/queries/admin";
import { useMe } from "~/queries/members";

const MIN_LENGTH = 10;

function ChangePasswordCard() {
	const { t } = useTranslation("auth");
	const toast = useKumoToastManager();
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		if (next.length < MIN_LENGTH) return setError(t("password.tooShort", { count: MIN_LENGTH }));
		if (next !== confirm) return setError(t("password.mismatch"));
		setError(null);
		setBusy(true);
		const { error: err } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
		setBusy(false);
		if (err) return setError(t("account.passwordFailed"));
		setCurrent("");
		setNext("");
		setConfirm("");
		toast.add({ title: t("account.passwordChanged") });
	};

	return (
		<form onSubmit={handleSubmit} className="rounded-lg border border-kumo-line bg-kumo-base p-5 space-y-3">
			<div className="text-sm font-medium text-kumo-default">{t("account.changePassword")}</div>
			<Input label={t("password.current")} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
			<Input label={t("password.new")} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
			<Input label={t("password.confirm")} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
			{error && <p role="alert" className="text-sm text-red-600">{error}</p>}
			<Button type="submit" variant="primary" loading={busy}>
				{t("account.changePasswordSubmit")}
			</Button>
		</form>
	);
}

function ApiKeysCard() {
	const { t } = useTranslation("auth");
	const toast = useKumoToastManager();
	const { data: keys = [] } = useApiKeys();
	const createKey = useCreateApiKey();
	const deleteKey = useDeleteApiKey();
	const [name, setName] = useState("");
	const [created, setCreated] = useState<string | null>(null);

	const onError = (e: unknown) => toast.add({ title: e instanceof Error ? e.message : t("account.keys.error"), variant: "error" });

	const handleCreate = () => {
		const value = name.trim();
		if (!value) return;
		createKey.mutate(value, {
			onSuccess: (k) => {
				setCreated(k.key);
				setName("");
			},
			onError,
		});
	};

	return (
		<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
			<div className="text-sm font-medium text-kumo-default mb-1">{t("account.keys.title")}</div>
			<p className="text-xs text-kumo-subtle mb-4">{t("account.keys.description")}</p>
			{created && (
				<div role="status" className="mb-4 rounded-lg border border-kumo-line bg-kumo-recessed p-3">
					<p className="text-xs text-kumo-subtle mb-1">{t("account.keys.copyNow")}</p>
					<code className="block break-all text-xs text-kumo-default select-all">{created}</code>
				</div>
			)}
			<ul className="space-y-2 mb-4">
				{keys.length === 0 && <li className="text-xs text-kumo-subtle">{t("account.keys.empty")}</li>}
				{keys.map((k) => (
					<li key={k.id} className="flex items-center justify-between gap-2 text-sm">
						<span className="min-w-0">
							<span className="text-kumo-default">{k.name}</span>
							<span className="block text-xs text-kumo-subtle">
								{k.prefix}… · {k.last_used_at ? t("account.keys.lastUsed", { date: new Date(k.last_used_at).toLocaleDateString() }) : t("account.keys.neverUsed")}
							</span>
						</span>
						<Button variant="ghost" size="xs" onClick={() => deleteKey.mutate(k.id, { onError })}>
							{t("account.keys.revoke")}
						</Button>
					</li>
				))}
			</ul>
			<div className="flex items-end gap-2">
				<div className="flex-1">
					<Input label={t("account.keys.name")} value={name} onChange={(e) => setName(e.target.value)} />
				</div>
				<Button variant="primary" onClick={handleCreate} loading={createKey.isPending}>
					{t("account.keys.create")}
				</Button>
			</div>
		</div>
	);
}

export default function AccountRoute() {
	const { t } = useTranslation("auth");
	const { data: me } = useMe();

	if (!me) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	const password = me.authMode === "password";

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-lg font-semibold text-kumo-default">{t("account.title")}</h1>
				<Link to="/" className="text-sm underline">{t("account.back")}</Link>
			</div>
			<p className="text-sm text-kumo-subtle">{t("account.signedInAs", { email: me.email })}</p>
			{password ? (
				<>
					<ChangePasswordCard />
					<ApiKeysCard />
					{me.isAdmin && (
						<Link to="/admin/users" className="inline-block text-sm underline">
							{t("account.manageUsers")}
						</Link>
					)}
				</>
			) : (
				<p className="text-sm text-kumo-subtle">{t("account.managedByAccess")}</p>
			)}
		</div>
	);
}
