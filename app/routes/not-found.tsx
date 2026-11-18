// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Empty } from "@cloudflare/kumo";
import { WarningIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

export default function NotFoundRoute() {
	const { t } = useTranslation("settings");
	const navigate = useNavigate();

	return (
		<div className="flex items-center justify-center min-h-screen">
			<Empty
				icon={<WarningIcon size={48} className="text-kumo-inactive" />}
				title={t("notFound.title")}
				description={t("notFound.description")}
				contents={
					<Button variant="primary" size="sm" onClick={() => navigate("/")}>
						{t("notFound.goHome")}
					</Button>
				}
			/>
		</div>
	);
}
