import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../types";
import { deleteAttachmentObjects } from "../attachments";

function fakeBucket() {
	const del = vi.fn().mockResolvedValue(undefined);
	return { bucket: { delete: del } as unknown as Env["BUCKET"], del };
}

describe("deleteAttachmentObjects", () => {
	it("deletes the R2 keys that storeAttachments writes", async () => {
		const { bucket, del } = fakeBucket();
		await deleteAttachmentObjects(bucket, "email-1", [{ id: "a1", filename: "invoice.pdf" }]);
		expect(del).toHaveBeenCalledWith(["attachments/email-1/a1/invoice.pdf"]);
	});

	it("batches at R2's 1000-key limit", async () => {
		const { bucket, del } = fakeBucket();
		const attachments = Array.from({ length: 1001 }, (_, i) => ({ id: `a${i}`, filename: "f" }));
		await deleteAttachmentObjects(bucket, "email-1", attachments);
		expect(del).toHaveBeenCalledTimes(2);
		expect(del.mock.calls[0][0]).toHaveLength(1000);
		expect(del.mock.calls[1][0]).toHaveLength(1);
	});
});
