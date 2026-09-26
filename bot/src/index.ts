import { computeSessionKey } from "./session-key.js";
import type { GitHubClient } from "./github.js";
import type { TelegramClient } from "./telegram.js";
import type { BotConfig, SessionState, TelegramUpdate } from "./types.js";

export const HELP_TEXT = [
  "iOS Cloud — sessão temporária de um iPhone real.",
  "",
  "/iphone — pedir um simulador",
  "/status — ver o estado",
  "/desligar — encerrar a sessão",
].join("\n");

export const PREPARING_TEXT = "🍎 Preparando seu iPhone...";
export const ALREADY_STARTING_TEXT = "Seu iPhone já está iniciando.";
export const ALREADY_ONLINE_TEXT = "Seu iPhone já está online.";
export const UNAUTHORIZED_TEXT = "Este chat não está autorizado.";
export const SHUTDOWN_TEXT = "⏹ Encerrando sessão...";
export const NO_SESSION_TEXT = "Não há sessão ativa para encerrar.";
export const UNKNOWN_TEXT = "Não entendi. Envie /start para ver os comandos.";
export const GITHUB_ERROR_TEXT =
  "Não foi possível falar com o GitHub agora. Tente de novo em instantes.";

const STATUS_TEXT: Record<SessionState, string> = {
  idle: "Nenhuma sessão ativa.",
  starting: "Estado: iniciando.",
  online: "Estado: online.",
  failed: "Estado: falhou.",
  expired: "Estado: expirada.",
};

export interface BotDependencies {
  config: BotConfig;
  github: GitHubClient;
  telegram: TelegramClient;
}

function commandName(text: string): string | null {
  const match = text.trim().match(/^\/([a-z0-9_]+)(?:@\w+)?(?:\s|$)/i);
  return match ? match[1].toLowerCase() : null;
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  deps: BotDependencies,
): Promise<void> {
  const text = update.message?.text;
  const chat = update.message?.chat;
  if (!text || !chat) return;

  const chatId = String(chat.id);
  if (chatId !== deps.config.telegramAllowedChatId) {
    await deps.telegram.sendMessage(chatId, UNAUTHORIZED_TEXT);
    return;
  }

  const command = commandName(text);
  try {
    switch (command) {
      case "start":
        await deps.telegram.sendMessage(chatId, HELP_TEXT);
        return;
      case "iphone":
        await startIphone(chatId, deps);
        return;
      case "status":
        await sendStatus(chatId, deps);
        return;
      case "desligar":
        await stopSession(chatId, deps);
        return;
      default:
        await deps.telegram.sendMessage(chatId, UNKNOWN_TEXT);
    }
  } catch {
    await deps.telegram.sendMessage(chatId, GITHUB_ERROR_TEXT);
  }
}

async function startIphone(chatId: string, deps: BotDependencies): Promise<void> {
  const status = await deps.github.getSessionStatus(
    computeSessionKey(chatId, deps.config.sessionHmacSecret),
  );
  if (status.state === "starting") {
    await deps.telegram.sendMessage(chatId, ALREADY_STARTING_TEXT);
    return;
  }
  if (status.state === "online") {
    await deps.telegram.sendMessage(chatId, ALREADY_ONLINE_TEXT);
    return;
  }
  const sessionKey = computeSessionKey(chatId, deps.config.sessionHmacSecret);
  await deps.github.startSession({
    sessionKey,
    chatId,
    durationMinutes: deps.config.sessionDurationMinutes,
  });
  await deps.telegram.sendMessage(chatId, PREPARING_TEXT);
}

async function sendStatus(chatId: string, deps: BotDependencies): Promise<void> {
  const status = await deps.github.getSessionStatus(
    computeSessionKey(chatId, deps.config.sessionHmacSecret),
  );
  await deps.telegram.sendMessage(chatId, STATUS_TEXT[status.state]);
}

async function stopSession(chatId: string, deps: BotDependencies): Promise<void> {
  const result = await deps.github.cancelSession(
    computeSessionKey(chatId, deps.config.sessionHmacSecret),
  );
  await deps.telegram.sendMessage(
    chatId,
    result.cancelled ? SHUTDOWN_TEXT : NO_SESSION_TEXT,
  );
}
