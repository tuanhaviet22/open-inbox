// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { SignatureBlock } from "../signature-block";

const TABLE =
	'<table cellpadding="0" style="font-family:Arial"><tbody><tr><td style="padding:0"><a href="https://sportix.vn" target="_blank"><img src="https://sportix.vn/logo.svg" width="130"></a></td></tr><tr><td><strong>Tuấn Hà</strong></td></tr></tbody></table>';

const makeEditor = (content: string) =>
	new Editor({ extensions: [StarterKit, SignatureBlock], content });

describe("SignatureBlock", () => {
	it("keeps tables, inline styles and images when loaded from HTML", () => {
		const editor = makeEditor(`<p>Hi</p><div data-signature="1">${TABLE}</div>`);
		const html = editor.getHTML();
		expect(html).toContain("<table");
		expect(html).toContain('style="font-family:Arial"');
		expect(html).toContain('src="https://sportix.vn/logo.svg"');
		expect(html).toContain("Tuấn Hà");
		editor.destroy();
	});

	it("can be inserted at the cursor and survives a round trip", () => {
		const editor = makeEditor("<p>Hello</p>");
		editor.chain().focus().insertContent({ type: "signatureBlock", attrs: { html: TABLE } }).run();
		const first = editor.getHTML();
		expect(first).toContain("<table");
		const again = makeEditor(first);
		expect(again.getHTML()).toBe(first);
		editor.destroy();
		again.destroy();
	});

	it("does not turn signature markup into escaped text", () => {
		const editor = makeEditor(`<div data-signature="1">${TABLE}</div>`);
		expect(editor.getHTML()).not.toContain("&lt;table");
		editor.destroy();
	});
});
