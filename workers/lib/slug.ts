// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * URL-safe slug for folder ids. Strips diacritics first so that names such as
 * "Công việc" become "cong-viec" instead of collapsing to an empty string.
 * Still returns "" for input with no Latin letters or digits (e.g. CJK).
 */
export function slugify(text: string): string {
	return text
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/đ/gi, "d")
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^\w-]+/g, "")
		.replace(/--+/g, "-")
		.replace(/^-+/, "")
		.replace(/-+$/, "");
}
