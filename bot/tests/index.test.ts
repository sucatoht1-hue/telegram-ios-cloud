import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALREADY_ONLINE_TEXT,
  ALREADY_STARTING_TEXT,
  GITHUB_ERROR_TEXT,
  HELP_TEXT,
  NO_SESSION_TEXT,
  PREPARING_TEXT,
  SHUTDOWN_TEXT,
  UNAUTHORIZED_TEXT,
  UNKNOWN_TEXT,
  handleTelegramUpdate,
  type BotDependencies,
} from "../src/index.js";
import { computeSessionKey } from "../src/session-key.js";
import type { BotConfig, SessionStatus, TelegramUpdate } from "../src/types.js";

const config: BotConfig = {
  telegramBotToken: "tg",
  telegramWebhookSecret: "wh",
  telegramAllowedChatId: "42",
  githubToken: "gh",
  githubRepository: "acme/telegram-ios-cloud",
  sessionHmacSecret: "hmac",
  sessionDurationMinutes: 20,
};

function update(text: string, chatId: number | string = 42): TelegramUpdate {
  return { update_id: 1, message: { message_id: 1, text, chat: { id: chatId } } };
}

function deps(status: SessionStatus = { state: "idle" }) {
  const github = {
    startSession: vi.fn(async () => undefined),
    findLatestSessionRun: vi.fn(async () => null),
    getSessionStatus: vi.fn(async () => status),
    cancelSession: vi.fn(async () => ({ cancelled: false as boolean, runId: undefined as number | undefined })),
  };
  const sent: string[] = [];
  const telegram = {
    sendMessage: vi.fn(async (_chatId: string, text: string) => {
      sent.push(text);
    }),
  };
  return { github, telegram, sent, bundle: { config, github, telegram } as BotDependencies };
}

describe("handleTelegramUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers /start with help", async () => {
    const { bundle, sent, github } = deps();
    await handleTelegramUpdate(update("/start"), bundle);
    expect(sent).toEqual([HELP_TEXT]);
    expect(github.startSession).not.toHaveBeenCalled();
  });

  it("dispatches /iphone when the chat is idle", async () => {
    const { bundle, sent, github } = deps({ state: "idle" });
    await handleTelegramUpdate(update("/iphone"), bundle);
    expect(github.startSession).toHaveBeenCalledWith({
      sessionKey: computeSessionKey("42", "hmac"),
      chatId: "42",
      durationMinutes: 20,
    });
    expect(sent).toEqual([PREPARING_TEXT]);
  });

  it("does not call GitHub for an unauthorized chat", async () => {
    const { bundle, sent, github } = deps();
    await handleTelegramUpdate(update("/iphone", 999), bundle);
    expect(github.startSession).not.toHaveBeenCalled();
    expect(github.getSessionStatus).not.toHaveBeenCalled();
    expect(github.cancelSession).not.toHaveBeenCalled();
    expect(sent).toEqual([UNAUTHORIZED_TEXT]);
  });

  it("rejects a duplicate /iphone without dispatching", async () => {
    const starting = deps({ state: "starting", runId: 5 });
    await handleTelegramUpdate(update("/iphone"), starting.bundle);
    expect(starting.github.startSession).not.toHaveBeenCalled();
    expect(starting.sent).toEqual([ALREADY_STARTING_TEXT]);

    const online = deps({ state: "online", runId: 6 });
    await handleTelegramUpdate(update("/iphone"), online.bundle);
    expect(online.github.startSession).not.toHaveBeenCalled();
    expect(online.sent).toEqual([ALREADY_ONLINE_TEXT]);
  });

  it("reports mapped status", async () => {
    const { bundle, sent } = deps({ state: "online", runId: 6 });
    await handleTelegramUpdate(update("/status"), bundle);
    expect(sent).toEqual(["Estado: online."]);
  });

  it("cancels an active session", async () => {
    const { bundle, sent, github } = deps();
    github.cancelSession.mockResolvedValueOnce({ cancelled: true, runId: 8 });
    await handleTelegramUpdate(update("/desligar"), bundle);
    expect(github.cancelSession).toHaveBeenCalledWith(computeSessionKey("42", "hmac"));
    expect(github.startSession).not.toHaveBeenCalled();
    expect(sent).toEqual([SHUTDOWN_TEXT]);
  });

  it("reports when /desligar has nothing to cancel", async () => {
    const { bundle, sent, github } = deps();
    await handleTelegramUpdate(update("/desligar"), bundle);
    expect(github.startSession).not.toHaveBeenCalled();
    expect(sent).toEqual([NO_SESSION_TEXT]);
  });

  it("answers unknown text", async () => {
    const { bundle, sent, github } = deps();
    await handleTelegramUpdate(update("oi"), bundle);
    expect(github.startSession).not.toHaveBeenCalled();
    expect(sent).toEqual([UNKNOWN_TEXT]);
  });

  it("hides GitHub failures", async () => {
    const { bundle, sent, github } = deps();
    github.getSessionStatus.mockRejectedValueOnce(new Error("GitHub API 500: gh"));
    await expect(handleTelegramUpdate(update("/iphone"), bundle)).rejects.toThrow(/GitHub API 500/);
    expect(github.startSession).not.toHaveBeenCalled();
    expect(sent).toEqual([GITHUB_ERROR_TEXT]);
  });
});
