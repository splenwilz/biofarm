import { PLATFORM_LABEL } from "@/lib/format";
import type { SpendEntry, SpendPlatform } from "@/lib/types";

export type CsvValue = string | number | null | undefined;

function cell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to RFC 4180 CSV; the header is the union of keys in first-seen order. */
export function toCsv(rows: Record<string, CsvValue>[]): string {
  const headers: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!headers.includes(k)) headers.push(k);
  const lines = [headers.map(cell).join(",")];
  for (const r of rows) lines.push(headers.map((h) => cell(r[h])).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** Browser download of a CSV string. No-op outside the browser. */
export function downloadCsv(filename: string, rows: Record<string, CsvValue>[]): void {
  if (typeof document === "undefined") return;
  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Minimal CSV reader: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const PLATFORM_ALIASES: Record<string, SpendPlatform> = {
  google: "google_ads",
  "google ads": "google_ads",
  google_ads: "google_ads",
  adwords: "google_ads",
  microsoft: "microsoft_ads",
  "microsoft ads": "microsoft_ads",
  microsoft_ads: "microsoft_ads",
  bing: "microsoft_ads",
  "bing ads": "microsoft_ads",
  linkedin: "linkedin_ads",
  "linkedin ads": "linkedin_ads",
  linkedin_ads: "linkedin_ads",
  other: "other",
};

export interface SpendImport {
  entries: Omit<SpendEntry, "id">[];
  errors: string[];
}

/**
 * Spend lines from a CSV with the columns month, platform, campaign, amount
 * (header names are case-insensitive; "spend" and "cost" also work for amount).
 * Months must be "YYYY-MM" and inside the allowed window. Bad lines are
 * reported, good lines are kept.
 */
export function parseSpendCsv(text: string, allowedMonths: readonly string[]): SpendImport {
  const rows = parseCsv(text);
  if (rows.length === 0) return { entries: [], errors: ["The file is empty."] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iMonth = col(["month"]);
  const iPlatform = col(["platform"]);
  const iCampaign = col(["campaign"]);
  const iAmount = col(["amount", "amount (£)", "spend", "cost", "amount_gbp", "amountgbp"]);
  if (iMonth < 0 || iPlatform < 0 || iAmount < 0) {
    return { entries: [], errors: ["Needs the columns month, platform, amount (campaign is optional)."] };
  }
  const entries: Omit<SpendEntry, "id">[] = [];
  const errors: string[] = [];
  rows.slice(1).forEach((r, n) => {
    const line = n + 2;
    const month = (r[iMonth] ?? "").trim();
    const platform = PLATFORM_ALIASES[(r[iPlatform] ?? "").trim().toLowerCase()];
    const amount = Number((r[iAmount] ?? "").replace(/[£,\s]/g, ""));
    if (!/^\d{4}-\d{2}$/.test(month) || !allowedMonths.includes(month)) {
      errors.push(`Line ${line}: month "${month}" is not a YYYY-MM inside the last ${allowedMonths.length} months.`);
      return;
    }
    if (!platform) {
      errors.push(`Line ${line}: platform "${(r[iPlatform] ?? "").trim()}" is not one of ${Object.values(PLATFORM_LABEL).join(", ")}.`);
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`Line ${line}: amount "${(r[iAmount] ?? "").trim()}" is not a number above zero.`);
      return;
    }
    const campaign = iCampaign >= 0 ? (r[iCampaign] ?? "").trim() : "";
    entries.push({ month, platform, campaign: campaign || PLATFORM_LABEL[platform], amountGbp: Math.round(amount * 100) / 100 });
  });
  return { entries, errors };
}
