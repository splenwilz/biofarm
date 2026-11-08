import { describe, expect, it } from "vitest";

import { parseCsv, parseSpendCsv, toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("writes a header from the keys and quotes what needs quoting", () => {
    const csv = toCsv([
      { month: "2026-10", source: "Paid search, Google", n: 3 },
      { month: "2026-09", source: 'He said "hi"', n: null },
    ]);
    expect(csv).toBe('month,source,n\r\n2026-10,"Paid search, Google",3\r\n2026-09,"He said ""hi""",\r\n');
  });
});

describe("parseCsv", () => {
  it("reads quoted fields, doubled quotes and both line endings", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""no"""\n1,2\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "no"'],
      ["1", "2"],
    ]);
  });
});

describe("parseSpendCsv", () => {
  const months = ["2026-08", "2026-09", "2026-10"];

  it("maps platform names, strips currency formatting and keeps good lines while reporting bad ones", () => {
    const text = ["Month,Platform,Campaign,Amount (£)", '2026-10,Google Ads,Search - Biofarm,"£1,978.50"', "2026-10,Bing,,380", "2026-07,LinkedIn,Developers,500", "2026-10,Facebook,x,10", "2026-09,Microsoft Ads,y,-5"].join("\n");
    const result = parseSpendCsv(text, months);
    expect(result.entries).toEqual([
      { month: "2026-10", platform: "google_ads", campaign: "Search - Biofarm", amountGbp: 1978.5 },
      { month: "2026-10", platform: "microsoft_ads", campaign: "Microsoft Ads", amountGbp: 380 },
    ]);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toMatch(/line 4/i);
    expect(result.errors[1]).toMatch(/facebook/i);
    expect(result.errors[2]).toMatch(/-5/);
  });

  it("refuses a file without the needed columns", () => {
    expect(parseSpendCsv("date,cost\n2026-10,5", months).errors[0]).toMatch(/needs the columns/i);
    expect(parseSpendCsv("", months).errors[0]).toMatch(/empty/i);
  });
});
