import { describe, expect, it } from "vitest";
import { mapWorkflowState, selectActiveRun } from "../src/state.js";
import type { WorkflowJobSummary, WorkflowRunSummary } from "../src/types.js";

function run(partial: Partial<WorkflowRunSummary> & Pick<WorkflowRunSummary, "id">): WorkflowRunSummary {
  return {
    status: "queued",
    conclusion: null,
    display_title: "iOS Cloud abc",
    ...partial,
  };
}

describe("selectActiveRun", () => {
  const runs = [
    run({ id: 1, display_title: "iOS Cloud other", status: "in_progress" }),
    run({ id: 2, display_title: "iOS Cloud abc", status: "completed", conclusion: "success" }),
    run({ id: 3, display_title: "iOS Cloud abc", status: "queued" }),
  ];

  it("ignores other session keys and completed runs", () => {
    expect(selectActiveRun(runs, "missing")).toBeNull();
    expect(selectActiveRun([runs[1]], "abc")).toBeNull();
  });

  it("returns the latest queued or in-progress run for the session", () => {
    expect(selectActiveRun(runs, "abc")?.id).toBe(3);
    expect(
      selectActiveRun(
        [run({ id: 9, display_title: "iOS Cloud abc", status: "in_progress" })],
        "abc",
      )?.id,
    ).toBe(9);
  });
});

describe("mapWorkflowState", () => {
  it("maps an absent run to idle", () => {
    expect(mapWorkflowState(null, []).state).toBe("idle");
  });

  it("maps queued and early in-progress to starting", () => {
    expect(mapWorkflowState(run({ id: 4, status: "queued" }), []).state).toBe("starting");
    const jobs: WorkflowJobSummary[] = [
      {
        id: 1,
        name: "session",
        status: "in_progress",
        conclusion: null,
        steps: [{ name: "Boot iOS Simulator", status: "in_progress", conclusion: null }],
      },
    ];
    expect(mapWorkflowState(run({ id: 5, status: "in_progress" }), jobs).state).toBe("starting");
  });

  it("reports online only while Keep session alive is in progress", () => {
    const jobs: WorkflowJobSummary[] = [
      {
        id: 1,
        name: "session",
        status: "in_progress",
        conclusion: null,
        steps: [
          { name: "Notify Telegram", status: "completed", conclusion: "success" },
          { name: "Keep session alive", status: "in_progress", conclusion: null },
        ],
      },
    ];
    expect(mapWorkflowState(run({ id: 6, status: "in_progress" }), jobs).state).toBe("online");
  });

  it("maps completed conclusions", () => {
    expect(
      mapWorkflowState(run({ id: 7, status: "completed", conclusion: "failure" }), []).state,
    ).toBe("failed");
    expect(
      mapWorkflowState(run({ id: 8, status: "completed", conclusion: "success" }), []).state,
    ).toBe("expired");
    expect(
      mapWorkflowState(run({ id: 9, status: "completed", conclusion: "cancelled" }), []).state,
    ).toBe("idle");
  });
});
