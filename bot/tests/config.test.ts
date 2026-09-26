import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const complete = {
  TELEGRAM_BOT_TOKEN: "tg",
  TELEGRAM_WEBHOOK_SECRET: "wh",
  TELEGRAM_ALLOWED_CHAT_ID: "42",
  GITHUB_TOKEN: "gh",
  GITHUB_REPOSITORY: "acme/telegram-ios-cloud",
  SESSION_HMAC_SECRET: "hmac",
};

describe("loadConfig", () => {
  it("defaults duration to 60", () => {
    expect(loadConfig(complete).sessionDurationMinutes).toBe(60);
  });

  it("accepts a duration inside 5..90", () => {
    expect(loadConfig({ ...complete, SESSION_DURATION_MINUTES: "5" }).sessionDurationMinutes).toBe(5);
    expect(loadConfig({ ...complete, SESSION_DURATION_MINUTES: "90" }).sessionDurationMinutes).toBe(90);
  });

  it.each([
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
    "TELEGRAM_ALLOWED_CHAT_ID",
    "GITHUB_TOKEN",
    "GITHUB_REPOSITORY",
    "SESSION_HMAC_SECRET",
  ])("throws when %s is missing", (key) => {
    const env = { ...complete, [key]: "  " };
    expect(() => loadConfig(env)).toThrow(new RegExp(key));
  });

  it.each(["4", "91", "20.5", "abc"])("throws when duration is %s", (value) => {
    expect(() => loadConfig({ ...complete, SESSION_DURATION_MINUTES: value })).toThrow(
      /SESSION_DURATION_MINUTES/,
    );
  });
});
