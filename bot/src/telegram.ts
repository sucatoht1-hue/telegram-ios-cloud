import type { InlineButton } from "./types.js";

export interface SendMessageOptions {
  inlineKeyboard?: InlineButton[][];
}

export interface TelegramClient {
  sendMessage(chatId: string, text: string, options?: SendMessageOptions): Promise<void>;
}

function redact(text: string, token: string): string {
  if (!token) return text;
  return text.split(token).join("<TOKEN>");
}

export function createTelegramClient(
  token: string,
  fetchImpl: typeof fetch = fetch,
): TelegramClient {
  return {
    async sendMessage(chatId, text, options) {
      const body: {
        chat_id: string;
        text: string;
        reply_markup?: { inline_keyboard: Array<Array<Record<string, string>>> };
      } = { chat_id: chatId, text };

      if (options?.inlineKeyboard) {
        body.reply_markup = {
          inline_keyboard: options.inlineKeyboard.map((row) =>
            row.map((button) => {
              const entry: Record<string, string> = { text: button.text };
              if (button.url) entry.url = button.url;
              if (button.callback_data) entry.callback_data = button.callback_data;
              return entry;
            }),
          ),
        };
      }

      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(redact(message, token));
      }

      if (!response.ok) {
        const detail = redact(await response.text(), token);
        throw new Error(`Telegram API ${response.status}: ${detail}`);
      }
    },
  };
}
