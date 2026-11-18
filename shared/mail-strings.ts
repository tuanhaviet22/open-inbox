// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { DEFAULT_LOCALE, type Locale, matchLocale } from "./locales";

/**
 * Strings that end up inside outgoing email, so they follow the mailbox's
 * locale rather than the viewer's UI language. Kept out of the i18next
 * bundles because they are needed in the Worker too.
 */
interface MailStrings {
	/** `{date}` and `{sender}` are substituted. */
	quotedHeader: string;
	replyPrefix: string;
	forwardPrefix: string;
	forwardedMessage: string;
	/** Labels inside the HTML forward block. */
	forwardedLabel: string;
	fromLabel: string;
	dateLabel: string;
	subjectLabel: string;
}

const MAIL_STRINGS: Record<Locale, MailStrings> = {
	en: {
		quotedHeader: "On {date}, {sender} wrote:",
		replyPrefix: "Re:",
		forwardPrefix: "Fwd:",
		forwardedMessage: "---------- Forwarded message ----------",
		forwardedLabel: "Forwarded message:",
		fromLabel: "From:",
		dateLabel: "Date:",
		subjectLabel: "Subject:",
	},
	vi: {
		quotedHeader: "Vào {date}, {sender} đã viết:",
		replyPrefix: "Re:",
		forwardPrefix: "Fwd:",
		forwardedMessage: "---------- Thư được chuyển tiếp ----------",
		forwardedLabel: "Thư được chuyển tiếp:",
		fromLabel: "Từ:",
		dateLabel: "Ngày:",
		subjectLabel: "Chủ đề:",
	},
};

export function getMailStrings(locale: string | null | undefined): MailStrings {
	return MAIL_STRINGS[matchLocale(locale) ?? DEFAULT_LOCALE];
}

export function formatQuotedHeader(locale: string | null | undefined, date: string, sender: string): string {
	// Function replacers: sender/date may contain "$" sequences.
	return getMailStrings(locale).quotedHeader.replace("{date}", () => date).replace("{sender}", () => sender);
}
