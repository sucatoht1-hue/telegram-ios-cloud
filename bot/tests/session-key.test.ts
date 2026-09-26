import { describe, expect, it } from "vitest";
import { computeSessionKey } from "../src/session-key.js";

describe("computeSessionKey", () => {
  it("is deterministic and changes when either input changes", () => {
    const first = computeSessionKey("42", "secret-a");
    const second = computeSessionKey("42", "secret-a");
    const otherChat = computeSessionKey("43", "secret-a");
    const otherSecret = computeSessionKey("42", "secret-b");

    expect(first).toBe(second);
    expect(first).not.toBe(otherChat);
    expect(first).not.toBe(otherSecret);
    expect(first).toMatch(/^[0-9a-f]{16}$/);
  });
});
