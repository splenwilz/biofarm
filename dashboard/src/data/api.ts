import "server-only";

import { demoDataSource } from "@/data/demo";
import type { DataSource } from "@/data/source";
import type { DashboardData } from "@/lib/types";

/**
 * The backend feed: GET /v1/dashboard on the lead API, which derives the
 * records from its Pipedrive mirror. This module runs on the server only;
 * the token never reaches the browser. Every request is fresh (no-store),
 * so a page load after an import shows the import.
 */

export interface ApiFeed {
  url: string;
  token: string;
}

const LIST_KEYS = ["deals", "enquiries", "spend", "traffic", "events", "annotations"] as const;

/** How long a page waits for the feed before failing plainly instead of hanging until the platform gives up. */
export const FEED_TIMEOUT_MS = 15_000;

function assertShape(body: unknown): asserts body is DashboardData {
  const b = body as Record<string, unknown> | null;
  const ok =
    b !== null &&
    typeof b === "object" &&
    LIST_KEYS.every((k) => Array.isArray(b[k])) &&
    typeof b.syncedAt === "string" &&
    (b.source === "pipedrive" || b.source === "demo") &&
    typeof b.newsletter === "object" &&
    typeof b.search === "object";
  if (!ok) throw new Error("Dashboard feed returned an unexpected shape");
}

export function createApiDataSource({ url, token }: ApiFeed): DataSource {
  const endpoint = `${url.replace(/\/+$/, "")}/v1/dashboard`;
  return {
    async getDashboardData() {
      let res: Response;
      try {
        res = await fetch(endpoint, { headers: { "x-dashboard-token": token, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(FEED_TIMEOUT_MS) });
      } catch (err) {
        if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
          throw new Error(`Dashboard feed did not answer within ${FEED_TIMEOUT_MS / 1000} seconds`);
        }
        throw err;
      }
      if (!res.ok) {
        let detail = "";
        try {
          detail = String((await res.json())?.detail ?? "");
        } catch {
          // no JSON body; the status alone will do
        }
        throw new Error(`Dashboard feed refused the request (${res.status})${detail ? `: ${detail}` : ""}`);
      }
      const body: unknown = await res.json();
      assertShape(body);
      if (!Array.isArray(body.newsletter.signups)) body.newsletter.signups = [];
      return body;
    },
  };
}

/** The backend feed when both settings are present, otherwise the demo data. */
export function selectDataSource(env: Record<string, string | undefined>): DataSource {
  const url = env.DASHBOARD_API_URL?.trim();
  const token = env.DASHBOARD_API_TOKEN?.trim();
  return url && token ? createApiDataSource({ url, token }) : demoDataSource;
}
