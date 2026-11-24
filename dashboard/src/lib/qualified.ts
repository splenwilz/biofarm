/**
 * The qualified-opportunities list: every record the tiles count, one row
 * each, with the agreed rule applied in words so anyone can check a number
 * against the records behind it. The counts here are the tiles' counts: the
 * same predicates (isQualified, attributionOf) decide both.
 */

import type { KpiConfig } from "@/config/kpi";
import type { CsvValue } from "@/lib/csv";
import { dateLabel } from "@/lib/format";
import { attributionOf, monthOf, qualifiedRecords, type Attribution } from "@/lib/kpi";
import type { Deal, Enquiry, EnquiryForm, Pipeline } from "@/lib/types";

export interface QualifiedRow {
  deal: Deal;
  inbound: boolean;
  attribution: Attribution;
  /** The verdict in words: the channel and whether the agreed rule counts it. */
  verdict: string;
  /** The enquiry the record came in as, when the feed can link them. */
  enquiry: Enquiry | null;
  /** How it came in, in words: the website form, or who made it. */
  cameIn: string;
}

export interface QualifiedCounts {
  inbound: number;
  network: number;
  unattributed: number;
  all: number;
}

export interface QualifiedList {
  rows: QualifiedRow[];
  counts: QualifiedCounts;
}

const FORM_LABEL: Record<EnquiryForm, string> = {
  contact: "contact form",
  newsletter: "newsletter sign-up",
  cpd: "CPD form",
  fold: "Fold form",
  landowner: "landowner form",
};

export function verdictOf(deal: Deal, cfg: KpiConfig): { attribution: Attribution; verdict: string } {
  const attribution = attributionOf(deal.channel, cfg);
  if (attribution === "inbound") return { attribution, verdict: `${deal.channel}: an inbound channel` };
  if (attribution === "network") return { attribution, verdict: `${deal.channel}: outbound or network, not inbound` };
  return { attribution, verdict: "No source channel set: not inbound" };
}

export function howItCameIn(deal: Deal, enquiry: Enquiry | null): string {
  if (enquiry?.form) return `Website: ${FORM_LABEL[enquiry.form]}`;
  switch (deal.origin) {
    case "website":
      return "Website";
    case "team":
      return `Created by ${deal.createdBy ?? "the team"}`;
    case "import":
      return "Imported in bulk";
    default:
      return "Not recorded";
  }
}

/** The enquiry a deal came in as: the lead it was converted from, else the deal itself when it was created directly. */
function enquiryFor(deal: Deal, byId: Map<string, Enquiry>): Enquiry | null {
  if (deal.sourceLeadId) {
    const lead = byId.get(deal.sourceLeadId);
    if (lead) return lead;
  }
  return byId.get(deal.id) ?? null;
}

export function qualifiedList(deals: Deal[], enquiries: Enquiry[], cfg: KpiConfig, months: readonly string[], pipeline?: Pipeline): QualifiedList {
  const byId = new Map(enquiries.map((e) => [e.id, e]));
  const rows = qualifiedRecords(deals, cfg, pipeline)
    .filter((d) => months.includes(monthOf(d.qualifiedAt)))
    .sort((a, b) => b.qualifiedAt.localeCompare(a.qualifiedAt) || a.id.localeCompare(b.id))
    .map((deal): QualifiedRow => {
      const { attribution, verdict } = verdictOf(deal, cfg);
      const enquiry = enquiryFor(deal, byId);
      return { deal, inbound: attribution === "inbound", attribution, verdict, enquiry, cameIn: howItCameIn(deal, enquiry) };
    });
  const counts: QualifiedCounts = { inbound: 0, network: 0, unattributed: 0, all: rows.length };
  for (const r of rows) counts[r.attribution] += 1;
  return { rows, counts };
}

export function qualifiedCsvRows(list: QualifiedList): Record<string, CsvValue>[] {
  return list.rows.map(({ deal, inbound, verdict, cameIn }) => ({
    Name: deal.personName ?? "",
    Company: deal.organisation ?? "",
    Pipeline: deal.pipeline,
    "Qualified on": deal.qualifiedAt ? dateLabel(deal.qualifiedAt) : "",
    "Received on": dateLabel(deal.createdAt),
    Channel: deal.channel ?? "",
    Inbound: inbound ? "Yes" : "No",
    "Why it counts": `${verdict}${deal.qualifiedBy ? `. ${deal.qualifiedBy}` : ""}`,
    "How it came in": cameIn,
    Source: deal.sourceLabel ?? "",
    Campaign: deal.campaign ?? "",
    Stage: deal.stage ?? "",
    Status: deal.status,
    "Pipedrive id": deal.id,
  }));
}
