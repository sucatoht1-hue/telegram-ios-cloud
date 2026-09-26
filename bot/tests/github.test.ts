import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../src/github.js";
import type { BotConfig } from "../src/types.js";

const config: BotConfig = {
  telegramBotToken: "tg",
  telegramWebhookSecret: "wh",
  telegramAllowedChatId: "42",
  githubToken: "ghs_secret_token",
  githubRepository: "acme/telegram-ios-cloud",
  sessionHmacSecret: "hmac",
  sessionDurationMinutes: 20,
};

interface Call {
  url: string;
  method: string;
  body?: string;
  authorization?: string | null;
  version?: string | null;
}

function mockFetch(
  handler: (url: string, init?: RequestInit) => { status: number; json?: unknown; text?: string },
) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
      authorization: headers.get("authorization"),
      version: headers.get("x-github-api-version"),
    });
    const result = handler(url, init);
    const raw =
      result.status === 204
        ? null
        : (result.text ?? (result.json === undefined ? "" : JSON.stringify(result.json)));
    return new Response(raw, { status: result.status });
  };
  return { fetchImpl, calls };
}

describe("createGitHubClient", () => {
  it("dispatches ios-cloud.yml on main with bearer auth", async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ status: 204 }));
    const client = createGitHubClient(config, fetchImpl);
    await client.startSession({ sessionKey: "abc123", chatId: "42", durationMinutes: 20 });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(
      "https://api.github.com/repos/acme/telegram-ios-cloud/actions/workflows/ios-cloud.yml/dispatches",
    );
    expect(calls[0]?.authorization).toBe("Bearer ghs_secret_token");
    expect(calls[0]?.version).toBe("2022-11-28");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      ref: "main",
      inputs: {
        session_key: "abc123",
        chat_id: "42",
        duration_minutes: "20",
      },
    });
  });

  it("lists workflow runs and returns the latest matching title", async () => {
    const { fetchImpl, calls } = mockFetch(() => ({
      status: 200,
      json: {
        workflow_runs: [
          {
            id: 7,
            status: "completed",
            conclusion: "success",
            display_title: "iOS Cloud other",
          },
          {
            id: 8,
            status: "completed",
            conclusion: "failure",
            display_title: "iOS Cloud abc123",
          },
        ],
      },
    }));
    const client = createGitHubClient(config, fetchImpl);
    const run = await client.findLatestSessionRun("abc123");
    expect(run?.id).toBe(8);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toContain(
      "/repos/acme/telegram-ios-cloud/actions/workflows/ios-cloud.yml/runs",
    );
  });

  it("loads jobs before reporting an in-progress run", async () => {
    const { fetchImpl, calls } = mockFetch((url) => {
      if (url.includes("/jobs")) {
        return {
          status: 200,
          json: {
            jobs: [
              {
                id: 1,
                name: "session",
                status: "in_progress",
                conclusion: null,
                steps: [{ name: "Keep session alive", status: "in_progress", conclusion: null }],
              },
            ],
          },
        };
      }
      return {
        status: 200,
        json: {
          workflow_runs: [
            {
              id: 11,
              status: "in_progress",
              conclusion: null,
              display_title: "iOS Cloud abc123",
            },
          ],
        },
      };
    });
    const client = createGitHubClient(config, fetchImpl);
    const status = await client.getSessionStatus("abc123");
    expect(status).toEqual({ state: "online", runId: 11 });
    expect(calls[1]?.method).toBe("GET");
    expect(calls[1]?.url).toBe(
      "https://api.github.com/repos/acme/telegram-ios-cloud/actions/runs/11/jobs",
    );
  });

  it("cancels only the active matching run", async () => {
    const { fetchImpl, calls } = mockFetch((url) => {
      if (url.endsWith("/cancel")) return { status: 202, json: {} };
      return {
        status: 200,
        json: {
          workflow_runs: [
            {
              id: 3,
              status: "completed",
              conclusion: "success",
              display_title: "iOS Cloud abc123",
            },
            {
              id: 4,
              status: "queued",
              conclusion: null,
              display_title: "iOS Cloud abc123",
            },
          ],
        },
      };
    });
    const client = createGitHubClient(config, fetchImpl);
    await expect(client.cancelSession("nope")).resolves.toEqual({ cancelled: false });
    const cancelled = await client.cancelSession("abc123");
    expect(cancelled).toEqual({ cancelled: true, runId: 4 });
    const cancelCall = calls.find((call) => call.url.endsWith("/cancel"));
    expect(cancelCall?.method).toBe("POST");
    expect(cancelCall?.url).toBe(
      "https://api.github.com/repos/acme/telegram-ios-cloud/actions/runs/4/cancel",
    );
  });

  it("never returns the GitHub token in errors", async () => {
    const { fetchImpl } = mockFetch(() => ({
      status: 401,
      text: "bad token ghs_secret_token",
    }));
    const client = createGitHubClient(config, fetchImpl);
    await expect(
      client.startSession({ sessionKey: "abc", chatId: "42", durationMinutes: 20 }),
    ).rejects.toThrowError(/\[redacted\]/);
    await expect(
      client.startSession({ sessionKey: "abc", chatId: "42", durationMinutes: 20 }),
    ).rejects.not.toThrowError(/ghs_secret_token/);
  });
});
