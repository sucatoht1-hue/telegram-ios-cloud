import type { BotConfig, SessionStatus, WorkflowJobSummary, WorkflowRunSummary } from "./types.js";
import { mapWorkflowState, selectActiveRun, selectLatestRun } from "./state.js";

const API_VERSION = "2022-11-28";
const WORKFLOW_FILE = "ios-cloud.yml";

interface WorkflowRunsResponse {
  workflow_runs?: WorkflowRunSummary[];
}

interface WorkflowJobsResponse {
  jobs?: WorkflowJobSummary[];
}

export interface GitHubClient {
  startSession(input: {
    sessionKey: string;
    chatId: string;
    durationMinutes: number;
  }): Promise<void>;
  findLatestSessionRun(sessionKey: string): Promise<WorkflowRunSummary | null>;
  getSessionStatus(sessionKey: string): Promise<SessionStatus>;
  cancelSession(sessionKey: string): Promise<{ cancelled: boolean; runId?: number }>;
}

function redact(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}

export function createGitHubClient(
  config: BotConfig,
  fetchImpl: typeof fetch = fetch,
): GitHubClient {
  const slash = config.githubRepository.indexOf("/");
  if (slash <= 0 || slash === config.githubRepository.length - 1) {
    throw new Error("GITHUB_REPOSITORY must look like owner/repo");
  }
  const owner = config.githubRepository.slice(0, slash);
  const repo = config.githubRepository.slice(slash + 1);
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${config.githubToken}`);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("X-GitHub-Api-Version", API_VERSION);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, { ...init, headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(redact(message, config.githubToken));
    }

    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        redact(`GitHub API ${response.status}: ${text || response.statusText}`, config.githubToken),
      );
    }
    if (!text) return null;
    return JSON.parse(text) as unknown;
  }

  async function listRuns(): Promise<WorkflowRunSummary[]> {
    const data = (await request(
      `/actions/workflows/${WORKFLOW_FILE}/runs?per_page=30`,
    )) as WorkflowRunsResponse | null;
    return data?.workflow_runs ?? [];
  }

  return {
    async startSession(input) {
      await request(`/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
        method: "POST",
        body: JSON.stringify({
          ref: "main",
          inputs: {
            session_key: input.sessionKey,
            chat_id: input.chatId,
            duration_minutes: String(input.durationMinutes),
          },
        }),
      });
    },

    async findLatestSessionRun(sessionKey) {
      return selectLatestRun(await listRuns(), sessionKey);
    },

    async getSessionStatus(sessionKey) {
      const runs = await listRuns();
      const active = selectActiveRun(runs, sessionKey);
      const run = active ?? selectLatestRun(runs, sessionKey);
      if (!run) return mapWorkflowState(null, []);
      if (run.status !== "in_progress") return mapWorkflowState(run, []);
      const data = (await request(
        `/actions/runs/${run.id}/jobs`,
      )) as WorkflowJobsResponse | null;
      return mapWorkflowState(run, data?.jobs ?? []);
    },

    async cancelSession(sessionKey) {
      const active = selectActiveRun(await listRuns(), sessionKey);
      if (!active) return { cancelled: false };
      await request(`/actions/runs/${active.id}/cancel`, { method: "POST" });
      return { cancelled: true, runId: active.id };
    },
  };
}
