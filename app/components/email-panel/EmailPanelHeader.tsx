// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useTranslation } from "react-i18next";

interface EmailPanelHeaderProps {
	subject: string;
	messageCount: number;
	showThreadCount: boolean;
}

export default function EmailPanelHeader({
	subject,
	messageCount,
	showThreadCount,
}: EmailPanelHeaderProps) {
	const { t } = useTranslation("mailbox");
	return (
		<div className="px-4 py-3 border-b border-kumo-line shrink-0 md:px-6">
			<h2 className="text-base font-semibold text-kumo-default">{subject}</h2>
			{showThreadCount && (
				<span className="text-xs text-kumo-subtle mt-0.5 block">
					{t("panel.messagesInThread", { count: messageCount })}
				</span>
			)}
		</div>
	);
}
