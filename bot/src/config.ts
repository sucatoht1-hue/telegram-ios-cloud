import type { BotConfig } from "./types.js";

const REQUIRED = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_ALLOWED_CHAT_ID",
  "GITHUB_TOKEN",
  "GITHUB_REPOSITORY",
  "SESSION_HMAC_SECRET",
] as const;

function required(env: NodeJS.ProcessEnv, key: (typeof REQUIRED)[number]): string {
  const value = env[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

export function loadConfig(env: NodeJS.ProcessEnv): BotConfig {
  const telegramBotToken = required(env, "TELEGRAM_BOT_TOKEN");
  const telegramWebhookSecret = required(env, "TELEGRAM_WEBHOOK_SECRET");
  const telegramAllowedChatId = required(env, "TELEGRAM_ALLOWED_CHAT_ID");
  const githubToken = required(env, "GITHUB_TOKEN");
  const githubRepository = required(env, "GITHUB_REPOSITORY");
  const sessionHmacSecret = required(env, "SESSION_HMAC_SECRET");

  const rawDuration = env.SESSION_DURATION_MINUTES;
  let sessionDurationMinutes = 60;
  if (rawDuration !== undefined && rawDuration.trim() !== "") {
    if (!/^[0-9]+$/.test(rawDuration.trim())) {
      throw new Error("SESSION_DURATION_MINUTES must be an integer between 5 and 90");
    }
    sessionDurationMinutes = Number(rawDuration.trim());
    if (sessionDurationMinutes < 5 || sessionDurationMinutes > 90) {
      throw new Error("SESSION_DURATION_MINUTES must be an integer between 5 and 90");
    }
  }

  return {
    telegramBotToken,
    telegramWebhookSecret,
    telegramAllowedChatId,
    githubToken,
    githubRepository,
    sessionHmacSecret,
    sessionDurationMinutes,
  };
}
