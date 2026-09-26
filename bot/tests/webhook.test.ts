import { describe, expect, it, vi } from "vitest";
import { handleNodeRequest, handleWebhook } from "../api/telegram.js";
import { HELP_TEXT } from "../src/index.js";
import type { BotConfig } from "../src/types.js";

const env = {
  TELEGRAM_BOT_TOKEN: "tg",
  TELEGRAM_WEBHOOK_SECRET: "top-secret",
  TELEGRAM_ALLOWED_CHAT_ID: "42",
  GITHUB_TOKEN: "gh",
  GITHUB_REPOSITORY: "acme/telegram-ios-cloud",
  SESSION_HMAC_SECRET: "hmac",
};

function request(secret?: string, body: string = "{}") {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret !== undefined) headers.set("x-telegram-bot-api-secret-token", secret);
  return new Request("https://example.vercel.app/api/telegram", {
    method: "POST",
    headers,
    body,
  });
}

describe("handleWebhook", () => {
  it("returns 401 and does not touch Telegram or GitHub when the secret is wrong or missing", async () => {
    const createDeps = vi.fn();
    const missing = await handleWebhook(request(undefined, "not-json"), env, createDeps);
    const wrong = await handleWebhook(request("nope", "not-json"), env, createDeps);
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(createDeps).not.toHaveBeenCalled();
  });

  it("reaches the command router when the secret matches", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const createDeps = vi.fn((config: BotConfig) => ({
      config,
      github: {
        startSession: vi.fn(),
        findLatestSessionRun: vi.fn(),
        getSessionStatus: vi.fn(),
        cancelSession: vi.fn(),
      },
      telegram: { sendMessage },
    }));
    const response = await handleWebhook(
      request(
        "top-secret",
        JSON.stringify({ update_id: 1, message: { text: "/start", chat: { id: 42 } } }),
      ),
      env,
      createDeps,
    );
    expect(response.status).toBe(200);
    expect(createDeps).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith("42", HELP_TEXT);
  });

  it("accepts the Node request used by Vercel serverless", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const createDeps = vi.fn((config: BotConfig) => ({
      config,
      github: {
        startSession: vi.fn(),
        findLatestSessionRun: vi.fn(),
        getSessionStatus: vi.fn(),
        cancelSession: vi.fn(),
      },
      telegram: { sendMessage },
    }));
    let statusCode = 0;
    let payload: unknown;
    const response = {
      status(code: number) {
        statusCode = code;
        return {
          send(body: string) {
            payload = body;
          },
          json(body: unknown) {
            payload = body;
          },
        };
      },
    };
    await handleNodeRequest(
      {
        headers: { "x-telegram-bot-api-secret-token": "top-secret" },
        body: { update_id: 1, message: { text: "/start", chat: { id: 42 } } },
      },
      response,
      env,
      createDeps,
    );
    expect(statusCode).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(sendMessage).toHaveBeenCalledWith("42", HELP_TEXT);
  });
});
