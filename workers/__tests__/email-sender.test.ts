import { describe, expect, it, vi } from "vitest";
import { getEmailProvider, webhookProvider } from "../email-sender";

const params = { to: "a@x.com", from: "me@x.com", subject: "Hi", text: "hello" };

describe("webhookProvider", () => {
	it("posts JSON with a bearer token and returns the relay's message id", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "m-1" })));
		const result = await webhookProvider("https://relay.test/send", "s3cret", fetchImpl as unknown as typeof fetch).send(params);
		expect(result).toEqual({ messageId: "m-1" });
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe("https://relay.test/send");
		expect(init.headers.Authorization).toBe("Bearer s3cret");
		expect(JSON.parse(init.body)).toMatchObject({ to: "a@x.com", subject: "Hi" });
	});

	it("generates an id when the relay returns an empty body", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		const { messageId } = await webhookProvider("https://relay.test", undefined, fetchImpl as unknown as typeof fetch).send(params);
		expect(messageId).toBeTruthy();
	});

	it("throws on a non-2xx response", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(new Response("no", { status: 502 }));
		await expect(webhookProvider("https://relay.test", undefined, fetchImpl as unknown as typeof fetch).send(params)).rejects.toThrow("502");
	});
});

describe("getEmailProvider", () => {
	it("uses Cloudflare unless a webhook URL is configured", () => {
		const EMAIL = { send: vi.fn() } as unknown as SendEmail;
		expect(getEmailProvider({ EMAIL }).name).toBe("cloudflare");
		expect(getEmailProvider({ EMAIL, OUTBOUND_WEBHOOK_URL: "https://relay.test" }).name).toBe("webhook");
	});
});
