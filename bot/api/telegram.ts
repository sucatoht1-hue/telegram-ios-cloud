import { loadConfig } from "../src/config.js";
import { createGitHubClient } from "../src/github.js";
import { handleTelegramUpdate, type BotDependencies } from "../src/index.js";
import { createTelegramClient } from "../src/telegram.js";
import type { BotConfig, TelegramUpdate } from "../src/types.js";

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

  try {
    const config = loadConfig(env);
    await handleTelegramUpdate(update as TelegramUpdate, createDeps(config));
  } catch (error) {
    return new Response(publicError(error), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

type HeaderBag = Record<string, string | string[] | undefined> & {
  get?: (name: string) => string | null;
};

type NodeRequest = {
  headers?: HeaderBag;
  body?: unknown;
};

type NodeResponse = {
  status: (code: number) => {
    send: (body: string) => void;
    json: (body: unknown) => void;
  };
};

function headerValue(headers: HeaderBag | undefined, name: string): string | null {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "internal error";
  if (message.startsWith("Missing required environment variable:")) return message;
  return "internal error";
}

export async function handleNodeRequest(
  request: NodeRequest,
  response: NodeResponse,
  env: NodeJS.ProcessEnv = process.env,
  createDeps: (config: BotConfig) => BotDependencies = defaultCreateDeps,
): Promise<void> {
  const provided = headerValue(request.headers, "x-telegram-bot-api-secret-token");
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || provided !== expected) {
    response.status(401).send("unauthorized");
    return;
  }

  const update = request.body;
  if (!update || typeof update !== "object") {
    response.status(400).send("bad request");
    return;
  }

  try {
    const config = loadConfig(env);
    await handleTelegramUpdate(update as TelegramUpdate, createDeps(config));
  } catch (error) {
    response.status(500).send(publicError(error));
    return;
  }

  response.status(200).json({ ok: true });
}

export default function handler(request: Request | NodeRequest, response?: NodeResponse): Promise<Response | void> {
  if (typeof response?.status === "function") {
    return handleNodeRequest(request as NodeRequest, response);
  }
  return handleWebhook(request as Request, process.env);
}
