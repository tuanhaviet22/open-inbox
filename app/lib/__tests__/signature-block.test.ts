// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { SignatureBlock } from "../signature-block";

const TABLE =
	'<table cellpadding="0" style="font-family:Arial"><tbody><tr><td style="padding:0"><a href="https://example.com" target="_blank"><img src="https://example.com/logo.svg" width="130"></a></td></tr><tr><td><strong>Tuấn Hà</strong></td></tr></tbody></table>';

const makeEditor = (content: string) =>
	new Editor({ extensions: [StarterKit, SignatureBlock], content });

describe("SignatureBlock", () => {
	it("keeps tables, inline styles and images when loaded from HTML", () => {
		const editor = makeEditor(`<p>Hi</p><div data-signature="1">${TABLE}</div>`);
		const html = editor.getHTML();
		expect(html).toContain("<table");
		expect(html).toContain('style="font-family:Arial"');
		expect(html).toContain('src="https://example.com/logo.svg"');
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

	describe("untrusted HTML", () => {
		const HOSTILE =
			'<div data-signature="1"><img src="x" onerror="window.__pwned=1"><script>window.__pwned=2</script>' +
			'<a href="javascript:window.__pwned=3">x</a><b>Tuấn</b></div>';

		it("is sanitized when a stored draft is loaded", () => {
			const editor = makeEditor(`<p>Hi</p>${HOSTILE}`);
			const html = editor.getHTML();
			expect(html).not.toMatch(/onerror/i);
			expect(html).not.toMatch(/<script/i);
			expect(html).not.toMatch(/javascript:/i);
			expect(html).toContain("Tuấn");
			editor.destroy();
		});

		it("never executes a handler when the node view renders it", () => {
			(window as unknown as { __pwned?: number }).__pwned = undefined;
			const editor = new Editor({ element: document.body.appendChild(document.createElement("div")), extensions: [StarterKit, SignatureBlock], content: HOSTILE });
			expect(document.body.innerHTML).not.toMatch(/onerror/i);
			expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
			editor.destroy();
		});

		it("is sanitized when inserted programmatically", () => {
			const editor = makeEditor("<p>Hello</p>");
			editor.chain().focus().insertContent({ type: "signatureBlock", attrs: { html: '<img src=x onerror="1">ok' } }).run();
			expect(editor.getHTML()).not.toMatch(/onerror/i);
			editor.destroy();
		});
	});
});
