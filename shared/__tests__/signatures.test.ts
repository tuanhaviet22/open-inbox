import { describe, expect, it } from "vitest";
import { getDefaultSignature, listSignatures, type Signature, validateSignatures } from "../signatures";

const sig = (id: string, name = id): Signature => ({ id, name, text: `text ${id}` });

describe("listSignatures / getDefaultSignature", () => {
	it("returns nothing without settings", () => {
		expect(listSignatures(undefined)).toEqual([]);
		expect(getDefaultSignature(null)).toBeNull();
	});

	it("reads the legacy single signature as the default", () => {
		const settings = { signature: { enabled: true, text: "Bye", html: "<b>Bye</b>" } };
		expect(listSignatures(settings)).toHaveLength(1);
		expect(getDefaultSignature(settings)).toMatchObject({ text: "Bye", html: "<b>Bye</b>" });
	});

	it("ignores a disabled or empty legacy signature", () => {
		expect(listSignatures({ signature: { enabled: false, text: "x" } })).toEqual([]);
		expect(listSignatures({ signature: { enabled: true, text: "" } })).toEqual([]);
	});

	it("prefers the new list over the legacy field", () => {
		const settings = { signatures: [sig("a")], signature: { enabled: true, text: "old" } };
		expect(listSignatures(settings).map((s) => s.id)).toEqual(["a"]);
	});

	it("an explicit empty list means no signatures, even with a legacy one", () => {
		expect(listSignatures({ signatures: [], signature: { enabled: true, text: "old" } })).toEqual([]);
	});

	it("uses defaultSignatureId, or none when unset or dangling", () => {
		const signatures = [sig("a"), sig("b")];
		expect(getDefaultSignature({ signatures, defaultSignatureId: "b" })?.id).toBe("b");
		expect(getDefaultSignature({ signatures })).toBeNull();
		expect(getDefaultSignature({ signatures, defaultSignatureId: "gone" })).toBeNull();
	});
});

describe("validateSignatures", () => {
	it("accepts a valid list", () => {
		expect(validateSignatures({ signatures: [sig("a"), sig("b")], defaultSignatureId: "a" })).toBeNull();
		expect(validateSignatures({})).toBeNull();
	});

	it("rejects duplicate ids and names (case-insensitive)", () => {
		expect(validateSignatures({ signatures: [sig("a"), sig("a", "other")] })).toMatch(/ids/);
		expect(validateSignatures({ signatures: [sig("a", "Work"), sig("b", "work ")] })).toMatch(/names/);
	});

	it("rejects an unknown default and too many signatures", () => {
		expect(validateSignatures({ signatures: [sig("a")], defaultSignatureId: "x" })).toMatch(/Default/);
		const many = Array.from({ length: 21 }, (_, i) => sig(`s${i}`));
		expect(validateSignatures({ signatures: many })).toMatch(/At most/);
	});
});
