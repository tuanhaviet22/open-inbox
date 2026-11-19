// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Node } from "@tiptap/react";
import DOMPurify from "dompurify";

/**
 * A signature is stored in the message body as one opaque block. TipTap's
 * normal schema would drop tables, inline styles and images, which is what most
 * HTML signatures are made of, so the block keeps its HTML untouched (it is
 * sanitized by `signatureToBlock` before it gets here).
 */
export const SIGNATURE_ATTR = "data-signature";

/**
 * Everything that enters or leaves the block goes through DOMPurify. The HTML can come from a
 * stored draft that someone else (a mailbox member, an MCP client) wrote, and the node view
 * assigns it with innerHTML, so a handler such as `<img onerror=...>` would otherwise run in
 * the reader's session.
 */
const clean = (html: unknown) => DOMPurify.sanitize(typeof html === "string" ? html : "", { ADD_ATTR: ["target"] });

export const SignatureBlock = Node.create({
	name: "signatureBlock",
	group: "block",
	atom: true,
	selectable: true,
	draggable: false,

	addAttributes() {
		return { html: { default: "" } };
	},

	parseHTML() {
		return [
			{
				tag: `div[${SIGNATURE_ATTR}]`,
				priority: 100,
				getAttrs: (el) => ({ html: clean((el as HTMLElement).innerHTML) }),
			},
		];
	},

	renderHTML({ node }) {
		const el = document.createElement("div");
		el.setAttribute(SIGNATURE_ATTR, "1");
		el.setAttribute("style", "border-top: 1px solid #ccc; margin-top: 16px; padding-top: 12px;");
		el.innerHTML = clean(node.attrs.html);
		return el as unknown as ["div"];
	},

	addNodeView() {
		return ({ node }) => {
			const dom = document.createElement("div");
			dom.setAttribute(SIGNATURE_ATTR, "1");
			dom.setAttribute("contenteditable", "false");
			dom.setAttribute("style", "border-top: 1px solid #ccc; margin-top: 16px; padding-top: 12px;");
			dom.innerHTML = clean(node.attrs.html);
			return { dom };
		};
	},
});
