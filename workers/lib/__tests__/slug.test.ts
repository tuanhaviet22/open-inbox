import { describe, expect, it } from "vitest";
import { slugify } from "../slug";

describe("slugify", () => {
	it("lowercases and hyphenates", () => {
		expect(slugify("My Folder")).toBe("my-folder");
	});

	it("strips Vietnamese diacritics", () => {
		expect(slugify("Công việc")).toBe("cong-viec");
		expect(slugify("Đã gửi")).toBe("da-gui");
	});

	it("returns empty string for input without Latin letters or digits", () => {
		expect(slugify("日本語")).toBe("");
		expect(slugify("!!!")).toBe("");
	});

	it("collapses repeated and edge hyphens", () => {
		expect(slugify("--a   b--")).toBe("a-b");
	});
});
