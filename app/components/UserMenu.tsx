// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button } from "@cloudflare/kumo";
import { SignOutIcon, UserCircleIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import LanguageSwitcher from "~/components/LanguageSwitcher";
import { authClient } from "~/lib/auth-client";
import { useMe } from "~/queries/members";

/**
 * Language, account and sign-out controls for pages outside a mailbox (the
 * mailbox list, account, user admin). Inside a mailbox the Header has the same.
 */
export default function UserMenu({ showAccountLink = true }: { showAccountLink?: boolean }) {
	const { t } = useTranslation("auth");
	const navigate = useNavigate();
	const { data: me } = useMe();
	const password = me?.authMode === "password";

	const handleSignOut = async () => {
		await authClient.signOut();
		window.location.assign("/login");
	};

	return (
		<div className="flex items-center gap-2">
			<LanguageSwitcher />
			{password && (
				<>
					<span className="hidden text-xs text-kumo-subtle sm:inline">{me.email}</span>
					{showAccountLink && (
						<Button variant="ghost" size="sm" icon={<UserCircleIcon size={16} />} onClick={() => navigate("/account")}>
							{t("account.title")}
						</Button>
					)}
					<Button variant="ghost" size="sm" icon={<SignOutIcon size={16} />} onClick={handleSignOut}>
						{t("account.signOut")}
					</Button>
				</>
			)}
		</div>
	);
}
