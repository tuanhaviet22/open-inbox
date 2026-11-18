import { describe, expect, it } from "vitest";
import { foldText, htmlToSearchText } from "../text";

describe("foldText", () => {
	it("removes Vietnamese diacritics and lowercases", () => {
		expect(foldText("Nguyễn Văn Đức")).toBe("nguyen van duc");
	});

	it("folds other accents", () => {
		expect(foldText("Café Crème")).toBe("cafe creme");
	});

	it("handles null and undefined", () => {
		expect(foldText(null)).toBe("");
		expect(foldText(undefined)).toBe("");
	});

	it("lets an unaccented query match an accented value", () => {
		expect(foldText("Họp nhóm tuần này")).toContain(foldText("hop nhom"));
	});
});

describe("htmlToSearchText", () => {
	it("strips tags, styles and scripts", () => {
		const html = "<style>p{color:red}</style><p>Hello&nbsp;<b>world</b></p><script>x()</script>";
		expect(htmlToSearchText(html)).toBe("Hello world");
	});

	it("caps the length", () => {
		expect(htmlToSearchText("a".repeat(100), 10)).toHaveLength(10);
	});
});
