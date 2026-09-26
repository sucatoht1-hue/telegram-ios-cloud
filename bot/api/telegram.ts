import { loadConfig } from "../src/config.js";
import { createGitHubClient } from "../src/github.js";
import { handleTelegramUpdate, type BotDependencies } from "../src/index.js";
import { createTelegramClient } from "../src/telegram.js";
import type { BotConfig } from "../src/types.js";

export function defaultCreateDeps(config: BotConfig): BotDependencies {
  return {
    config,
    github: createGitHubClient(config),
    telegram: createTelegramClient(config.telegramBotToken),
  };
}

export async function handleWebhook(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
  createDeps: (config: BotConfig) => BotDependencies = defaultCreateDeps,
): Promise<Response> {
  const provided = request.headers.get("x-telegram-bot-api-secret-token");
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || provided !== expected) {
    return new Response("unauthorized", { status: 401 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const config = loadConfig(env);
  await handleTelegramUpdate(update as Parameters<typeof handleTelegramUpdate>[0], createDeps(config));
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export default function handler(request: Request): Promise<Response> {
  return handleWebhook(request, process.env);
}
