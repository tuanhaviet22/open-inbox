// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input } from "@cloudflare/kumo";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { authClient } from "~/lib/auth-client";

const MIN_LENGTH = 10;

export default function ResetPasswordRoute() {
	const { t } = useTranslation("auth");
	const [params] = useSearchParams();
	const token = params.get("token");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);
	const [busy, setBusy] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		if (password.length < MIN_LENGTH) return setError(t("password.tooShort", { count: MIN_LENGTH }));
		if (password !== confirm) return setError(t("password.mismatch"));
		setError(null);
		setBusy(true);
		const { error: err } = await authClient.resetPassword({ newPassword: password, token: token ?? "" });
		setBusy(false);
		if (err) return setError(t("reset.invalidToken"));
		setDone(true);
	};

	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-kumo-line bg-kumo-base p-6">
				<h1 className="text-lg font-semibold text-kumo-default">{t("reset.title")}</h1>
				{!token ? (
					<p role="alert" className="text-sm text-red-600">{t("reset.invalidToken")}</p>
				) : done ? (
					<>
						<p role="status" className="text-sm text-kumo-default">{t("reset.done")}</p>
						<a href="/login" className="text-sm underline">{t("reset.backToLogin")}</a>
					</>
				) : (
					<>
						<Input label={t("password.new")} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
						<Input label={t("password.confirm")} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
						{error && <p role="alert" className="text-sm text-red-600">{error}</p>}
						<Button type="submit" variant="primary" className="w-full" loading={busy}>
							{t("reset.submit")}
						</Button>
					</>
				)}
			</form>
		</div>
	);
}
