import { describe, expect, it } from "vitest";
import { normalizeWebhookUrl } from "../scripts/configure-webhook.js";

describe("normalizeWebhookUrl", () => {
  it("resolves a site origin to the telegram webhook path", () => {
    expect(normalizeWebhookUrl("https://example.vercel.app/")).toBe(
      "https://example.vercel.app/api/telegram",
    );
    expect(normalizeWebhookUrl("https://example.vercel.app/api/telegram")).toBe(
      "https://example.vercel.app/api/telegram",
    );
  });

  it("rejects non-HTTPS URLs", () => {
    expect(() => normalizeWebhookUrl("http://example.vercel.app/")).toThrow(/HTTPS/);
  });
});
