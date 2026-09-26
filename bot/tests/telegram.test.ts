import { describe, expect, it } from "vitest";
import { createTelegramClient } from "../src/telegram.js";

describe("createTelegramClient", () => {
  it("posts text and an optional inline keyboard", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), body: String(init?.body ?? "") });
      return new Response("{}", { status: 200 });
    };
    const client = createTelegramClient("123:SECRET", fetchImpl);
    await client.sendMessage("42", "olá", {
      inlineKeyboard: [[{ text: "ABRIR IPHONE", url: "https://example.trycloudflare.com/simulators/udid" }]],
    });

    expect(calls[0]?.url).toBe("https://api.telegram.org/bot123:SECRET/sendMessage");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      chat_id: "42",
      text: "olá",
      reply_markup: {
        inline_keyboard: [
          [{ text: "ABRIR IPHONE", url: "https://example.trycloudflare.com/simulators/udid" }],
        ],
      },
    });
  });

  it("redacts the bot token from errors", async () => {
    const fetchImpl: typeof fetch = async () => new Response("bad 123:SECRET", { status: 500 });
    const client = createTelegramClient("123:SECRET", fetchImpl);
    await expect(client.sendMessage("42", "olá")).rejects.toThrowError(/<TOKEN>/);
    await expect(client.sendMessage("42", "olá")).rejects.not.toThrowError(/123:SECRET/);
  });
});
