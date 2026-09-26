export type SessionState = "idle" | "starting" | "online" | "failed" | "expired";

export interface SessionStatus {
  state: SessionState;
  runId?: number;
}

export interface WorkflowRunSummary {
  id: number;
  status: string;
  conclusion: string | null;
  display_title: string;
  html_url?: string;
}

export interface WorkflowStepSummary {
  name: string;
  status: string;
  conclusion: string | null;
}

export interface WorkflowJobSummary {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  steps?: WorkflowStepSummary[];
}

export interface TelegramChat {
  id: number | string;
}

export interface TelegramMessage {
  message_id?: number;
  text?: string;
  chat: TelegramChat;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
}

export interface InlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface BotConfig {
  telegramBotToken: string;
  telegramWebhookSecret: string;
  telegramAllowedChatId: string;
  githubToken: string;
  githubRepository: string;
  sessionHmacSecret: string;
  sessionDurationMinutes: number;
}
