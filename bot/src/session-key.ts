import { createHmac } from "node:crypto";

export function computeSessionKey(chatId: string, secret: string): string {
  return createHmac("sha256", secret).update(chatId).digest("hex").slice(0, 16);
}
