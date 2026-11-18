// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Case- and accent-insensitive form of a string, used for search so that
 * "nguyen" matches "Nguyễn" and "Cafe" matches "café". Works for any script
 * with combining marks (Vietnamese, French, Spanish, ...).
 */
export function foldText(input: string | null | undefined): string {
	return (input ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/đ/gi, "d")
		.toLowerCase();
}

/** Plain-text approximation of an HTML body, for the search index only. */
export function htmlToSearchText(html: string | null | undefined, maxLength = 20_000): string {
	return (html ?? "")
		.slice(0, maxLength * 4)
		.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, maxLength);
}
