import type { IconName } from "@/components/shell/icons";

export interface NavItem {
  name: string;
  href: string;
  icon: IconName;
  /** One line under the page title. */
  description: string;
}

export const OVERVIEW: NavItem = {
  name: "Overview",
  href: "/",
  icon: "squares",
  description: "Marketing's two measures and the trend behind them.",
};

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Performance",
    items: [
      { name: "Sources", href: "/sources", icon: "globe", description: "Enquiries and qualified opportunities by where they came from, by form, and what became of them." },
      { name: "Campaigns", href: "/campaigns", icon: "megaphone", description: "Spend, enquiries and qualified opportunities per campaign, and by landing page." },
      { name: "Enquiry to qualified", href: "/cohorts", icon: "trending", description: "How each month's enquiries matured into qualified opportunities." },
      { name: "Traffic", href: "/traffic", icon: "cursor", description: "Website sessions by channel and how many became enquiries." },
      { name: "Newsletter", href: "/newsletter", icon: "envelope", description: "Subscribers, and opens and clicks per issue." },
      { name: "Search & AI", href: "/search", icon: "search", description: "Brand searches, AI referrals and AI mention share." },
      { name: "Events", href: "/events", icon: "calendar", description: "Trade shows, CPD sessions and webinars: attendees, leads and what qualified." },
      { name: "Media spend", href: "/spend", icon: "banknotes", description: "Campaign and media spend by month, and the cost per qualified opportunity it gives." },
    ],
  },
  {
    title: "Operations",
    items: [
      { name: "Alerts", href: "/alerts", icon: "bell", description: "What needs attention this month." },
      { name: "Data quality", href: "/data-quality", icon: "shield", description: "Gaps in the records that distort the numbers, and what to fix in Pipedrive." },
      { name: "Monthly report", href: "/report", icon: "document", description: "The month on one page: print it, copy it, or schedule it." },
    ],
  },
  {
    title: "Setup",
    items: [{ name: "KPI rule & targets", href: "/kpi-rule", icon: "adjustments", description: "What counts as a qualified inbound opportunity, the targets, and where each number comes from." }],
  },
];

export const ALL_PAGES: NavItem[] = [OVERVIEW, ...NAV_SECTIONS.flatMap((s) => s.items)];

/** Root is exact-matched; every other item also matches its nested routes. */
export function isActiveHref(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const DRAWER_WIDTH = 256;
export const TOP_BAR_HEIGHT = 64;

/** Placeholder until sign-in exists; the footer then shows the signed-in person. */
export const SHELL_USER = { name: "Godswill William", role: "Marketing", initials: "GW" };
