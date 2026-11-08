import type { DashboardData } from "@/lib/types";

/**
 * Where the dashboard gets its records. v1 ships with the demo source; the
 * backend-backed source implements the same interface, so the swap is one
 * import in `src/data/index.ts`.
 */
export interface DataSource {
  getDashboardData(): Promise<DashboardData>;
}
