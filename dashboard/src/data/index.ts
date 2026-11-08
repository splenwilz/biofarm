import { selectDataSource } from "@/data/api";
import type { DataSource } from "@/data/source";

/**
 * The data source the app uses: the backend feed when DASHBOARD_API_URL and
 * DASHBOARD_API_TOKEN are set (server-side only), otherwise the demo data.
 * Chosen when asked, per request, so the environment is read at request time
 * (after `connection()` in the layout) rather than once when the module loads.
 */
export function getDataSource(): DataSource {
  return selectDataSource(process.env);
}
