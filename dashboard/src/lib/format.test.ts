import { describe, expect, it } from "vitest";

import { dateLabel, gbp, integer, monthLabel, monthName, pct, signed, windowLabel } from "@/lib/format";

describe("format", () => {
  it("labels months", () => {
    expect(monthLabel("2026-10")).toBe("Oct 2026");
    expect(monthLabel("2026-01", false)).toBe("Jan");
    expect(monthName("2026-09")).toBe("September");
  });
  it("labels a window of months, repeating the year only when it changes", () => {
    expect(windowLabel(["2026-10"])).toBe("Oct 2026");
    expect(windowLabel(["2026-08", "2026-09", "2026-10"])).toBe("Aug to Oct 2026");
    expect(windowLabel(["2025-11", "2026-10"])).toBe("Nov 2025 to Oct 2026");
    expect(windowLabel([])).toBe("–");
  });
  it("formats pounds without pence and a dash for nothing", () => {
    expect(gbp(1500.5)).toBe("£1,501");
    expect(gbp(0)).toBe("£0");
    expect(gbp(null)).toBe("–");
  });
  it("formats percentages and counts", () => {
    expect(pct(0.5)).toBe("50%");
    expect(pct(0.333, 1)).toBe("33.3%");
    expect(pct(null)).toBe("–");
    expect(integer(1274)).toBe("1,274");
  });
  it("labels dates in UTC", () => {
    expect(dateLabel("2026-11-01T06:00:00Z")).toBe("1 Nov 2026");
  });
});

describe("signed", () => {
  it("writes a count with its sign, using the minus sign and ± for zero", () => {
    expect(signed(8)).toBe("+8");
    expect(signed(-2)).toBe("−2");
    expect(signed(0)).toBe("±0");
    expect(signed(1234)).toBe("+1,234");
  });
});
