import type {
  SessionStatus,
  WorkflowJobSummary,
  WorkflowRunSummary,
  WorkflowStepSummary,
} from "./types.js";

export const KEEP_ALIVE_STEP = "Keep session alive";

export function sessionTitle(sessionKey: string): string {
  return `iOS Cloud ${sessionKey}`;
}

export function selectActiveRun(
  runs: WorkflowRunSummary[],
  sessionKey: string,
): WorkflowRunSummary | null {
  const title = sessionTitle(sessionKey);
  return (
    runs.find(
      (run) =>
        run.display_title === title &&
        (run.status === "queued" || run.status === "in_progress"),
    ) ?? null
  );
}

export function selectLatestRun(
  runs: WorkflowRunSummary[],
  sessionKey: string,
): WorkflowRunSummary | null {
  const title = sessionTitle(sessionKey);
  return runs.find((run) => run.display_title === title) ?? null;
}

function keepAliveStep(jobs: WorkflowJobSummary[]): WorkflowStepSummary | undefined {
  for (const job of jobs) {
    const step = job.steps?.find((item) => item.name === KEEP_ALIVE_STEP);
    if (step) return step;
  }
  return undefined;
}

export function mapWorkflowState(
  run: WorkflowRunSummary | null,
  jobs: WorkflowJobSummary[] = [],
): SessionStatus {
  if (!run) return { state: "idle" };

  if (run.status === "queued") {
    return { state: "starting", runId: run.id };
  }

  if (run.status === "in_progress") {
    const keep = keepAliveStep(jobs);
    if (keep?.status === "in_progress") {
      return { state: "online", runId: run.id };
    }
    return { state: "starting", runId: run.id };
  }

  if (run.status === "completed") {
    if (run.conclusion === "failure") return { state: "failed", runId: run.id };
    if (run.conclusion === "success") return { state: "expired", runId: run.id };
    if (run.conclusion === "cancelled") return { state: "idle", runId: run.id };
  }

  return { state: "idle", runId: run.id };
}
