import { describe, it, expect } from "vitest";

// Extract the timer formatting logic for unit testing
function formatCountdown(endsAt: string, now: number): string {
  const diff = new Date(endsAt).getTime() - now;
  if (diff <= 0) return "Round ended!";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

describe("Timer countdown logic", () => {
  it("formats hours, minutes, seconds with zero-padding", () => {
    const now = Date.now();
    const endsAt = new Date(now + 3 * 3_600_000 + 5 * 60_000 + 9_000).toISOString();
    expect(formatCountdown(endsAt, now)).toBe("03:05:09");
  });

  it("shows 00:00:00 boundary correctly", () => {
    const now = Date.now();
    const endsAt = new Date(now + 500).toISOString(); // 0.5s left
    expect(formatCountdown(endsAt, now)).toBe("00:00:00");
  });

  it("returns 'Round ended!' when time is past", () => {
    const now = Date.now();
    const endsAt = new Date(now - 1000).toISOString();
    expect(formatCountdown(endsAt, now)).toBe("Round ended!");
  });

  it("returns 'Round ended!' when diff is exactly 0", () => {
    const now = Date.now();
    const endsAt = new Date(now).toISOString();
    expect(formatCountdown(endsAt, now)).toBe("Round ended!");
  });

  it("handles exactly 1 hour", () => {
    const now = Date.now();
    const endsAt = new Date(now + 3_600_000).toISOString();
    expect(formatCountdown(endsAt, now)).toBe("01:00:00");
  });
});
