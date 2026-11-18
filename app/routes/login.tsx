// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input } from "@cloudflare/kumo";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "~/components/LanguageSwitcher";
import { authClient } from "~/lib/auth-client";

export function meta() {
	return [{ title: "Open Inbox" }];
}

export default function LoginRoute() {
	const { t } = useTranslation("auth");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		setNotice(null);
		setBusy(true);
		const { error: err } = await authClient.signIn.email({ email: email.trim(), password });
		setBusy(false);
		if (!err) {
			window.location.assign("/");
			return;
		}
		setError(err.status === 429 ? t("login.tooMany") : t("login.invalid"));
	};

	const handleForgot = async () => {
		if (!email.trim()) {
			setError(t("login.emailFirst"));
			return;
		}
		setError(null);
		setBusy(true);
		await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" });
		setBusy(false);
		// Same message whether or not the account exists, so emails cannot be enumerated.
		setNotice(t("login.resetSent"));
	};

	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-kumo-line bg-kumo-base p-6">
				<div className="flex items-center justify-between">
					<h1 className="text-lg font-semibold text-kumo-default">{t("login.title")}</h1>
					<LanguageSwitcher />
				</div>
				<Input label={t("fields.email")} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
				<Input
					label={t("fields.password")}
					type="password"
					autoComplete="current-password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					required
				/>
				{error && <p role="alert" className="text-sm text-red-600">{error}</p>}
				{notice && <p role="status" className="text-sm text-kumo-subtle">{notice}</p>}
				<Button type="submit" variant="primary" className="w-full" loading={busy}>
					{t("login.submit")}
				</Button>
				<button type="button" onClick={handleForgot} className="text-xs text-kumo-subtle underline">
					{t("login.forgot")}
				</button>
			</form>
		</div>
	);
}
