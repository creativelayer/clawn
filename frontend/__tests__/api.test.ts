import { describe, it, expect, vi, beforeEach } from "vitest";
import { getActiveRound, getLeaderboard, submitRoast, getRoundResults } from "../lib/api";

// Mock fetch to force mock-data fallback
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no backend")));
});

describe("API mock fallbacks", () => {
  it("getActiveRound returns mock round", async () => {
    const round = await getActiveRound();
    expect(round).toBeDefined();
    expect(round.id).toBe("round-1");
    expect(round.status).toBe("active");
    expect(round.theme).toContain("portfolio");
    expect(round.prizePool).toBe(2_500_000);
    expect(round.entryCount).toBe(47);
  });

  it("getLeaderboard returns mock entries", async () => {
    const lb = await getLeaderboard();
    expect(lb).toHaveLength(5);
    expect(lb[0].wins).toBeGreaterThan(lb[1].wins);
    expect(lb[0].name).toBe("honkmaster.eth");
  });

  it("submitRoast returns mock id on failure", async () => {
    const result = await submitRoast("round-1", "test roast", 1234);
    expect(result.id).toMatch(/^mock-/);
  });

  it("getRoundResults returns ended round with roasts", async () => {
    const { round, roasts } = await getRoundResults("round-42");
    expect(round.id).toBe("round-42");
    expect(round.status).toBe("ended");
    expect(roasts).toHaveLength(3);
    expect(roasts[0].rank).toBe(1);
  });
});
