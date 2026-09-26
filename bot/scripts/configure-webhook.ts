import { pathToFileURL } from "node:url";

export function normalizeWebhookUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Webhook URL is invalid");
  }
  if (url.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS");
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/api/telegram") {
    return `${url.origin}/api/telegram`;
  }
  return `${url.origin}/api/telegram`;
}

async function main(): Promise<void> {
  const raw = process.argv[2];
  if (!raw) {
    console.error("Usage: npm run configure-webhook -- <https-public-bot-url>");
    process.exit(1);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) {
    console.error("Missing Telegram webhook configuration.");
    process.exit(1);
  }

  const target = normalizeWebhookUrl(raw);
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: target,
      secret_token: secret,
    }),
  });

  if (!response.ok) {
    console.error("Failed to configure webhook.");
    process.exit(1);
  }

  console.log(`Webhook configured: ${target}`);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch(() => {
    console.error("Failed to configure webhook.");
    process.exit(1);
  });
}
