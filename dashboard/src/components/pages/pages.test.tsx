import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { kpiConfig } from "@/config/kpi";
import { buildDemoData, DEMO_LAST_MONTH } from "@/data/demo";
import { monthRange } from "@/lib/kpi";
import { DashboardProvider } from "@/components/DashboardProvider";
import { CohortsPage } from "@/components/pages/CohortsPage";
import { AlertsPage } from "@/components/pages/AlertsPage";
import { CampaignsPage } from "@/components/pages/CampaignsPage";
import { DataQualityPage } from "@/components/pages/DataQualityPage";
import { EventsPage } from "@/components/pages/EventsPage";
import { KpiRulePage } from "@/components/pages/KpiRulePage";
import { ReportPage } from "@/components/pages/ReportPage";
import { TrafficPage } from "@/components/pages/TrafficPage";
import { NewsletterPage } from "@/components/pages/NewsletterPage";
import { SearchPage } from "@/components/pages/SearchPage";
import { conversionText, OverviewPage } from "@/components/pages/OverviewPage";
import { SourcesPage } from "@/components/pages/SourcesPage";
import { SpendPage } from "@/components/pages/SpendPage";
import { navState, resetNavigation } from "@/test/navigation";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

const data = buildDemoData();

function wrap(ui: React.ReactNode) {
  return render(
    <DashboardProvider data={data} config={kpiConfig}>
      {ui}
    </DashboardProvider>,
  );
}

function wrapWithoutSpend(ui: React.ReactNode) {
  return render(
    <DashboardProvider data={{ ...data, spend: [] }} config={kpiConfig}>
      {ui}
    </DashboardProvider>,
  );
}

describe("cost per qualified while there is no spend data", () => {
  beforeEach(() => resetNavigation());

  it("overview, spend, report, sources and campaigns show a dash and say they are waiting for ad spend data", () => {
    const { unmount } = wrapWithoutSpend(<OverviewPage />);
    expect(screen.getByTestId("kpi-cpqo")).toHaveTextContent(/^Cost per qualified–Waiting for ad spend data$/);
    unmount();
    resetNavigation("/spend");
    const spend = wrapWithoutSpend(<SpendPage />);
    expect(screen.getByTestId("kpi-spend-cpqo")).toHaveTextContent(/–Waiting for ad spend data/);
    expect(screen.getByTestId("kpi-cpqo-trailing")).toHaveTextContent(/–Waiting for ad spend data/);
    spend.unmount();
    resetNavigation("/report");
    const report = wrapWithoutSpend(<ReportPage />);
    expect(screen.getByText("Cost per qualified opportunity").parentElement).toHaveTextContent(/–.*Waiting for ad spend data/);
    report.unmount();
    resetNavigation("/sources");
    const sources = wrapWithoutSpend(<SourcesPage />);
    expect(screen.getByTestId("kpi-paid-cpqo")).toHaveTextContent(/^Paid cost per qualified–Waiting for ad spend data$/);
    sources.unmount();
    resetNavigation("/campaigns");
    wrapWithoutSpend(<CampaignsPage />);
    expect(screen.getByTestId("kpi-campaign-cpqo")).toHaveTextContent(/^Cost per qualified–Waiting for ad spend data$/);
  });
});

describe("qualified share minimum", () => {
  it("a share needs at least the configured enquiries; Sales-created stays when deals outnumber enquiries", () => {
    expect(conversionText({ conversionBase: 1, qualified: 1, conversion: 1 }, 5)).toBe("–");
    expect(conversionText({ conversionBase: 4, qualified: 2, conversion: 0.5 }, 5)).toBe("–");
    expect(conversionText({ conversionBase: 5, qualified: 2, conversion: 0.4 }, 5)).toBe("40%");
    expect(conversionText({ conversionBase: 0, qualified: 2, conversion: null }, 5)).toBe("Sales-created");
    expect(conversionText({ conversionBase: 2, qualified: 3, conversion: 1.5 }, 5)).toBe("Sales-created");
    expect(conversionText({ conversionBase: 0, qualified: 0, conversion: null }, 5)).toBe("–");
    expect(kpiConfig.qualifiedShareMinEnquiries).toBe(5);
  });
});

describe("OverviewPage", () => {
  beforeEach(() => resetNavigation());

  it("with one audience selected, the enquiries tile says how many inbound enquiries have no known audience", () => {
    resetNavigation("/", "audience=developer");
    wrap(<OverviewPage />);
    expect(screen.getByTestId("kpi-enquiries")).toHaveTextContent(/\d+ audience unknown · \d+ outbound \/ network · \d+ no channel set · not counted$/);
    resetNavigation("/");
  });

  it("renders the title, three tiles that each show the month's number and the change from the previous month, and the trend", () => {
    wrap(<OverviewPage />);
    expect(screen.getByRole("heading", { level: 1, name: /overview/i })).toBeInTheDocument();
    expect(screen.getByTestId("kpi-qualified")).toHaveTextContent(/^Qualified opportunities\d+[−+±]\d+ vs September$/);
    expect(screen.getByTestId("kpi-cpqo")).toHaveTextContent(/^Cost per qualified£[\d,]+[−+±]£[\d,]+ vs September$/);
    expect(screen.getByTestId("kpi-enquiries")).toHaveTextContent(/^Enquiries\d+[−+±]\d+ vs September\d+ outbound \/ network · \d+ no channel set · not counted$/);
    expect(screen.queryByTestId("kpi-speed")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Speed to lead" })).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /qualified opportunities by month/i })).toBeInTheDocument();
  });

  it("keeps the target, the trailing average, last year and the method in a short tooltip", async () => {
    wrap(<OverviewPage />);
    fireEvent.mouseOver(screen.getByRole("button", { name: /^about qualified opportunities$/i }));
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent(/inbound deals qualified in October/i);
    expect(tip).toHaveTextContent(/target 12/i);
    expect(tip).toHaveTextContent(/3-month average [\d.]+/i);
    expect(tip).toHaveTextContent(/Oct 2025: \d+/);
    expect(tip.textContent!.split(/[.·]\s*/).filter(Boolean).length).toBeLessThanOrEqual(6);
  });

  it("names the month in the header and the window on the breakdowns", () => {
    wrap(<OverviewPage />);
    expect(screen.getByText(/^Oct 2026 · Developer and landowner pipelines/)).toBeInTheDocument();
    expect(screen.queryByText(/sources over/i)).not.toBeInTheDocument();
    expect(screen.getByText(/^Aug to Oct 2026 · the darker part qualified/)).toBeInTheDocument();
    expect(screen.getByText(/^Nov 2025 to Oct 2026 · inbound in green/)).toBeInTheDocument();
  });

  it("follows the window in the URL for the source breakdown, not the tiles", () => {
    resetNavigation("/", "window=12");
    wrap(<OverviewPage />);
    expect(screen.getByText(/^Nov 2025 to Oct 2026 · the darker part qualified/)).toBeInTheDocument();
    expect(screen.getAllByText(/vs September/i).length).toBe(3);
  });

  it("keeps every explanation to one line, with the detail behind info icons", async () => {
    wrap(<OverviewPage />);
    expect(screen.queryByText(/pick another in the top bar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hover a cell for the count/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/synced/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/carry the date they became a deal/i)).not.toBeInTheDocument();
    const icons = screen.getAllByRole("button", { name: /^about /i });
    expect(icons.length).toBeGreaterThanOrEqual(6);
    fireEvent.mouseOver(screen.getByRole("button", { name: /about qualified opportunities by month/i }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/network business brought in by sales/i);
  });

  it("offers a CSV export and a 12/24-month trend toggle", () => {
    wrap(<OverviewPage />);
    expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
    const toggle = screen.getByRole("group", { name: /months shown/i });
    fireEvent.click(within(toggle).getByRole("button", { name: /24 months/i }));
    expect(within(toggle).getByRole("button", { name: /24 months/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("lists the source groups with counts first and the qualified share after", () => {
    wrap(<OverviewPage />);
    const table = screen.getByRole("table", { name: /top sources/i });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Source", "", "Enquiries", "Qualified", "Qualified %"]);
    expect(within(table).getByText("Paid search")).toBeInTheDocument();
    expect(within(table).queryByText("Google Ads")).not.toBeInTheDocument();
    expect(within(table).queryByRole("button")).not.toBeInTheDocument();
  });

  it("links through to the full source and cohort pages", () => {
    wrap(<OverviewPage />);
    expect(screen.getByRole("link", { name: /all sources/i })).toHaveAttribute("href", "/sources");
    expect(screen.getByRole("link", { name: /all cohorts/i })).toHaveAttribute("href", "/cohorts");
  });

  it("the audience in the URL changes the numbers", () => {
    wrap(<OverviewPage />);
    const all = screen.getByTestId("kpi-qualified").textContent;
    resetNavigation("/", "audience=landowner");
    wrap(<OverviewPage />);
    const land = screen.getAllByTestId("kpi-qualified")[1].textContent;
    expect(land).not.toEqual(all);
    expect(screen.getByText(/^Oct 2026 · Landowner pipeline/)).toBeInTheDocument();
  });
});

describe("SourcesPage", () => {
  beforeEach(() => resetNavigation("/sources"));

  it("shows sources, forms and outcomes", () => {
    wrap(<SourcesPage />);
    expect(screen.getByRole("heading", { level: 1, name: /sources/i })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /enquiries by source/i });
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(3);
    expect(within(table).getByRole("columnheader", { name: "Conversion" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Cost per qualified" })).toBeInTheDocument();
    expect(within(table).getByText("Direct/unknown")).toBeInTheDocument();
    expect(within(table).queryByText("Google Ads")).not.toBeInTheDocument();
    fireEvent.click(within(table).getByRole("button", { name: /show paid search platforms/i }));
    expect(within(table).getByText("Google Ads")).toBeInTheDocument();
    expect(within(table).getByText("Microsoft Ads")).toBeInTheDocument();
    expect(screen.queryByText(/last 3 months/i)).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: /enquiries by form/i })).toBeInTheDocument();
    // the by-form table counts the same inbound enquiries as the tile above it
    const tile = Number(within(screen.getByTestId("kpi-source-enquiries")).getByText(/^[\d,]+$/).textContent!.replace(/,/g, ""));
    const formRows = within(screen.getByRole("table", { name: /enquiries by form/i })).getAllByRole("row").slice(1);
    const formTotal = formRows.reduce((s, row) => s + Number(within(row).getAllByRole("cell")[1]!.textContent!.replace(/,/g, "")), 0);
    expect(formTotal).toBe(tile);
    expect(screen.getByRole("heading", { name: /outcome of qualified enquiries by source/i })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: /outcome of qualified enquiries by source/i })).toBeInTheDocument();
    expect(screen.getByText(/deal outcomes are managed by sales, shown for context/i)).toBeInTheDocument();
    expect(screen.queryByText("Biggest source")).not.toBeInTheDocument();
  });

  it("shows four tiles with one number and one comparison with the previous window each, the rest behind the icon", async () => {
    wrap(<SourcesPage />);
    expect(screen.getByTestId("kpi-source-enquiries")).toHaveTextContent(/^Enquiries\d+[−+±]\d+ vs May to Jul 2026$/);
    expect(screen.getByTestId("kpi-paid-share")).toHaveTextContent(/^Paid share\d+%[−+±]\d+ pts vs May to Jul 2026$/);
    expect(screen.getByTestId("kpi-paid-cpqo")).toHaveTextContent(/^Paid cost per qualified£[\d,]+[−+±]£[\d,]+ vs May to Jul 2026$/);
    expect(screen.getByTestId("kpi-best-converting")).toHaveTextContent(/^Best converting[A-Za-z /]+\d+% of \d+ qualified$/);
    expect(screen.queryByText(/minimum 5 enquiries/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ad spend per qualified enquiry/i)).not.toBeInTheDocument();
    fireEvent.mouseOver(screen.getByRole("button", { name: /^about best converting$/i }));
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent(/at least 5 enquiries/i);
    expect(tip).toHaveTextContent(/Aug to Oct 2026/);
    expect(tip).toHaveTextContent(/May to Jul 2026: [A-Za-z /]+/);
  });

  it("keeps the note under the source table to one line, with the grouping rules behind the section's icon", async () => {
    wrap(<SourcesPage />);
    expect(screen.getByText("Cost per qualified is shown for paid sources only.")).toBeInTheDocument();
    expect(screen.queryByText(/grouped from their source and medium/i)).not.toBeInTheDocument();
    fireEvent.mouseOver(screen.getByRole("button", { name: /^about enquiries by source$/i }));
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent(/grouped from their source and medium/i);
    expect(tip).toHaveTextContent(/Campaigns \/ Outreach, Existing Network, Introducer/);
  });

  it("offers a 1, 3 or 12 month window that lives in the URL", () => {
    wrap(<SourcesPage />);
    const toggle = screen.getByRole("group", { name: /period length/i });
    expect(within(toggle).getByRole("button", { name: /3 months/i })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(toggle).getByRole("button", { name: /12 months/i }));
    expect(navState.replace).toHaveBeenCalledWith("/sources?window=12", { scroll: false });
  });

  it("reads the window from the URL and says so on the page", () => {
    resetNavigation("/sources", "window=1");
    wrap(<SourcesPage />);
    expect(within(screen.getByRole("group", { name: /period length/i })).getByRole("button", { name: /1 month/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("kpi-source-enquiries")).toHaveTextContent(/vs September$/);
    expect(screen.getAllByText(/Oct 2026/).length).toBeGreaterThan(1);
  });
});

describe("CohortsPage", () => {
  beforeEach(() => resetNavigation("/cohorts"));

  it("shows twelve cohorts as one heatmap, newest first, with maturity marked", () => {
    wrap(<CohortsPage />);
    const grid = screen.getByRole("table", { name: /qualified, by enquiry month/i });
    const rows = within(grid).getAllByRole("row");
    expect(rows).toHaveLength(13);
    expect(within(rows[1]).getByText("Oct 2026")).toBeInTheDocument();
    expect(within(grid).getAllByText(/maturing/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
  });
});

describe("SpendPage", () => {
  beforeEach(() => resetNavigation("/spend"));

  it("adds spend through the shared provider so the overview sees it", () => {
    render(
      <DashboardProvider data={data} config={kpiConfig}>
        <OverviewPage />
        <SpendPage />
      </DashboardProvider>,
    );
    const before = screen.getByTestId("kpi-cpqo").textContent;
    const add = screen.getByRole("button", { name: /^add spend$/i });
    expect(add.closest("[data-print='hide']")).not.toBeNull();
    fireEvent.click(add);
    const dialog = screen.getByRole("dialog", { name: /^add spend$/i });
    fireEvent.change(within(dialog).getByLabelText(/^campaign$/i), { target: { value: "Extra" } });
    fireEvent.change(within(dialog).getByLabelText(/amount/i), { target: { value: "5000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("kpi-cpqo").textContent).not.toEqual(before);
    expect(screen.getByRole("button", { name: /import csv/i })).toBeInTheDocument();
  });

  it("by platform follows the shared window toggle, names the period in its title and dashes cost per qualified under 3 qualified", () => {
    wrap(<SpendPage />);
    expect(screen.getByRole("heading", { level: 2, name: /^by platform, aug to oct 2026$/i })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: /spend by platform, aug to oct 2026/i });
    for (const item of within(list).getAllByRole("listitem")) {
      const text = item.textContent ?? "";
      const qualified = Number(/(\d+) qualified/.exec(text)![1]);
      if (qualified < 3) expect(text).toMatch(/cost per qualified –/);
      else expect(text).toMatch(/cost per qualified £[\d,]+/);
    }
    fireEvent.click(screen.getByRole("button", { name: /^1 month$/i }));
    expect(navState.replace).toHaveBeenLastCalledWith(expect.stringContaining("window=1"), expect.anything());
    resetNavigation("/spend", "window=1");
    wrap(<SpendPage />);
    expect(screen.getByRole("heading", { level: 2, name: /^by platform, oct 2026$/i })).toBeInTheDocument();
  });
});

describe("SpendPage removals", () => {
  beforeEach(() => resetNavigation("/spend"));

  it("removing a line changes the month's cost per qualified opportunity on the overview", () => {
    render(
      <DashboardProvider data={data} config={kpiConfig}>
        <OverviewPage />
        <SpendPage />
      </DashboardProvider>,
    );
    const before = screen.getByTestId("kpi-cpqo").textContent;
    fireEvent.click(screen.getAllByRole("button", { name: /^remove (google|microsoft|linkedin)/i })[0]);
    expect(screen.getByTestId("kpi-cpqo").textContent).not.toEqual(before);
  });
});

describe("KpiRulePage", () => {
  beforeEach(() => resetNavigation("/kpi-rule"));

  it("spells out the rule with the shared channel names and the two notes", () => {
    wrap(<KpiRulePage />);
    expect(screen.getByRole("heading", { level: 1, name: /kpi rule/i })).toBeInTheDocument();
    const inbound = screen.getByText("Inbound source channels").parentElement!;
    for (const name of ["Paid search", "Organic search", "LinkedIn ads", "LinkedIn posts", "Newsletter", "Referral", "Events", "Website (source not tracked)", "Info email inbox", "Marketplace", "Direct/unknown"]) {
      expect(within(inbound).getByText(name)).toBeInTheDocument();
    }
    expect(within(inbound).queryByText("Website")).not.toBeInTheDocument();
    expect(screen.getByText("Landowner enquiries will have their own checklist.")).toBeInTheDocument();
    expect(screen.getByText("Once the checks are agreed, a stage move alone won't count as qualified.")).toBeInTheDocument();
    expect(screen.getByText("Draft, not yet agreed")).toBeInTheDocument();
  });

  it("lists the five draft checks as switches, all off", () => {
    wrap(<KpiRulePage />);
    const group = screen.getByRole("group", { name: /checks/i });
    const switches = within(group).getAllByRole("switch");
    expect(switches.map((s) => s.getAttribute("aria-checked") ?? (s as HTMLInputElement).checked.toString())).toEqual(["false", "false", "false", "false", "false"]);
    expect(within(group).getByRole("switch", { name: /it's a buyer: a developer or their consultant/i })).toBeInTheDocument();
    expect(within(group).getByRole("switch", { name: /it's a real project: a site, with planning in progress or granted/i })).toBeInTheDocument();
    expect(within(group).getByRole("switch", { name: /we can serve it: a bank in the same or a neighbouring council area/i })).toBeInTheDocument();
    expect(within(group).getByRole("switch", { name: /right habitat type/i })).toBeInTheDocument();
    expect(within(group).getByRole("switch", { name: /realistic timing: units needed within 12 to 18 months/i })).toBeInTheDocument();
  });

  it("shows the targets, the ramp and this month's target, with no admin role", () => {
    wrap(<KpiRulePage />);
    expect(screen.getByLabelText(/brand searches a month/i)).toHaveValue(90);
    expect(screen.getByText(/rising to 12 a month by Jan 2027/i)).toBeInTheDocument();
    expect(screen.getByText(/target for oct 2026: 8/i)).toBeInTheDocument();
    expect(screen.queryByText(/admin/i)).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: /target changes/i })).toHaveTextContent(/no changes yet/i);
  });

  it("says where each number comes from", () => {
    wrap(<KpiRulePage />);
    expect(screen.getByText(/pipedrive updates arrive through webhooks as they happen\./i)).toBeInTheDocument();
    expect(screen.queryByText(/nightly/i)).not.toBeInTheDocument();
    expect(screen.getByText("Pulled from the Google Ads and LinkedIn APIs once a day. Entered by hand only for events and other costs.")).toBeInTheDocument();
    expect(screen.getByText("Google Ads conversion counts")).toBeInTheDocument();
  });
});

describe("NewsletterPage", () => {
  beforeEach(() => resetNavigation("/newsletter"));

  it("shows subscribers, the last issue's rates and one meter per issue", () => {
    wrap(<NewsletterPage />);
    expect(screen.getByRole("heading", { level: 1, name: /newsletter/i })).toBeInTheDocument();
    expect(screen.getByText("Subscribers")).toBeInTheDocument();
    expect(screen.getByText("933")).toBeInTheDocument();
    expect(screen.getByText(/open rate, last issue/i)).toBeInTheDocument();
    expect(screen.getByText(/net growth/i)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /newsletter issues/i });
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(within(table).getByText(/padel, policy and progress/i)).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Click rate" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /^joined and left by month$/i })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: /joined and left by month/i })).toBeInTheDocument();
    expect(screen.queryByText(/net new subscribers by month/i)).not.toBeInTheDocument();
    expect(screen.getByRole("figure", { name: /^subscribers by month$/i })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: /^sign-ups through the website$/i })).toBeInTheDocument();
    expect(screen.getByText(/not counted as enquiries/i)).toBeInTheDocument();
  });

  it("cards show one number and one comparison each, click rate before open rate, with the rest behind the icon", async () => {
    wrap(<NewsletterPage />);
    expect(screen.getByTestId("kpi-subscribers")).toHaveTextContent(/^Subscribers[\d,]+[−+±]\d+ vs Sep 2026$/);
    expect(screen.getByTestId("kpi-net-growth")).toHaveTextContent(/^Net growth, 12 months[−+±]\d+\d+ joined, \d+ left$/);
    expect(screen.getByTestId("kpi-click-rate")).toHaveTextContent(/^Click rate, last issue\d+(\.\d)?%[−+±]\d+ pts vs previous issue"Slades at Sleight, 70 hectares and the NSIP story" · sent 15 Oct 2026$/);
    expect(screen.getByTestId("kpi-open-rate")).toHaveTextContent(/^Open rate, last issue\d+(\.\d)?%[−+±]\d+ pts vs previous issue"Slades at Sleight, 70 hectares and the NSIP story" · sent 15 Oct 2026$/);
    const ids = screen.getAllByTestId(/^kpi-(subscribers|net-growth|click-rate|open-rate)$/).map((el) => el.getAttribute("data-testid"));
    expect(ids).toEqual(["kpi-subscribers", "kpi-net-growth", "kpi-click-rate", "kpi-open-rate"]);
    expect(screen.queryByText(/clicks from/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/12-month average/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/of recipients unsubscribed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Oct 2025/)).not.toBeInTheDocument();
    fireEvent.mouseOver(screen.getByRole("button", { name: /^about open rate, last issue$/i }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/Opens are inflated by Apple Mail privacy features\. Use click rate as the main measure\./);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/12-month average \d+%/);
  });
});

describe("SearchPage", () => {
  beforeEach(() => resetNavigation("/search"));

  it("shows brand searches against target, AI referrals and mention share", () => {
    wrap(<SearchPage />);
    expect(screen.getByRole("heading", { level: 1, name: /search & ai/i })).toBeInTheDocument();
    expect(within(screen.getByTestId("kpi-brand")).getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getAllByText(/target 90/i).length).toBeGreaterThan(0);
    expect(screen.getByText("AI mention share")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: /ai referrals by assistant/i });
    expect(within(list).getByText("ChatGPT")).toBeInTheDocument();
  });
});

describe("OverviewPage notes", () => {
  beforeEach(() => resetNavigation());

  it("lets a note be added to the chart", () => {
    wrap(<OverviewPage />);
    fireEvent.change(screen.getByLabelText(/what happened/i), { target: { value: "Site relaunch" } });
    fireEvent.click(screen.getByRole("button", { name: /add note/i }));
    expect(within(screen.getByRole("list", { name: /^notes$/i })).getByText("Site relaunch")).toBeInTheDocument();
  });
});

describe("CampaignsPage", () => {
  beforeEach(() => resetNavigation("/campaigns"));

  it("joins spend and results per campaign and lists landing pages", () => {
    wrap(<CampaignsPage />);
    const table = screen.getByRole("table", { name: /campaign performance/i });
    expect(within(table).getByText("AWD - MOF - Search - Biofarm")).toBeInTheDocument();
    const rows = within(table).getAllByRole("row");
    expect(within(table).queryByText("No campaign tag")).not.toBeInTheDocument();
    expect(within(rows[rows.length - 1]).getByText("Untracked")).toBeInTheDocument();
    expect(within(rows[rows.length - 1]).getByTestId("bar-total")).toHaveStyle({ width: "0%" });
    expect(within(table).getByRole("columnheader", { name: "Cost per qualified" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /landing page/i })).toBeInTheDocument();
    expect(screen.getByText(/best value/i)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /period length/i })).toBeInTheDocument();
    expect(screen.queryByText(/last 3 months/i)).not.toBeInTheDocument();
  });

  it("keeps each card to one short line, with no formula text, and the detail behind the icon", async () => {
    wrap(<CampaignsPage />);
    expect(screen.queryByText(/÷/)).not.toBeInTheDocument();
    expect(screen.queryByText(/entered on the Media spend page/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/carried a campaign tag/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("kpi-media-spend")).toHaveTextContent(/^Media spend£[\d,]+\d+ campaigns? with spend$/);
    expect(screen.getByTestId("kpi-campaign-enquiries")).toHaveTextContent(/^Enquiries from campaigns\d+\d+% of \d+ enquiries$/);
    expect(screen.getByTestId("kpi-campaign-cpqo")).toHaveTextContent(/^Cost per qualified£[\d,]+\d+ qualified from paid campaigns$/);
    fireEvent.mouseOver(screen.getByRole("button", { name: /^about cost per qualified$/i }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/spend on tagged campaigns divided by/i);
  });

  it("only names a best value with at least 3 qualified, says so, and falls back to not enough data", () => {
    wrap(<CampaignsPage />);
    const tile = screen.getByTestId("kpi-best-value");
    expect(tile).toHaveTextContent(/Minimum 3 qualified in the period/);
    expect(tile).toHaveTextContent(/Best value(Not enough data yet|.+£[\d,]+ per qualified · \d+ qualified)/);
  });

  it("keeps the table note to one line with the rest behind the section's icon", async () => {
    wrap(<CampaignsPage />);
    expect(screen.getByText("Untracked enquiries are listed last without a bar.")).toBeInTheDocument();
    expect(screen.queryByText(/audience-neutral/i)).not.toBeInTheDocument();
    fireEvent.mouseOver(screen.getByRole("button", { name: /^about campaign performance$/i }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/spend is not split by audience/i);
  });

  it("hides the cost columns for a single audience and says why", () => {
    resetNavigation("/campaigns", "audience=developer");
    wrap(<CampaignsPage />);
    const table = screen.getByRole("table", { name: /campaign performance/i });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Campaign", "Enquiries", "Spend", "Enquiries", "Qualified"]);
    expect(within(table).queryByRole("columnheader", { name: /cost per/i })).not.toBeInTheDocument();
    expect(screen.getByText("Cost shown for all audiences only.")).toBeInTheDocument();
    expect(screen.queryByText("Untracked enquiries are listed last without a bar.")).not.toBeInTheDocument();
  });

  it("titles the landing page table with the period and shows conversion only from 5 enquiries", () => {
    wrap(<CampaignsPage />);
    expect(screen.getByRole("heading", { name: "Enquiries by landing page, Aug to Oct 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Landing pages$/ })).not.toBeInTheDocument();
    const table = screen.getByRole("table", { name: /enquiries by landing page/i });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
      const enquiries = Number(cells[1]!.replace(/,/g, ""));
      if (enquiries < 5) expect(cells[3]).toBe("–");
      else expect(cells[3]).toMatch(/^\d+%$/);
    }
    expect(rows.some((row) => Number(within(row).getAllByRole("cell")[1].textContent) < 5)).toBe(true);
    expect(screen.getByText("Conversion is shown for pages with at least 5 enquiries.")).toBeInTheDocument();
  });

  it("notes what a brand search campaign is on its row", () => {
    wrap(<CampaignsPage />);
    const table = screen.getByRole("table", { name: /campaign performance/i });
    const brand = within(table).getByRole("row", { name: /AWD - Brand - Search/i });
    expect(brand).toHaveTextContent(/People searching for Biofarm by name, usually cheaper than other campaigns/);
    expect(within(table).getByRole("row", { name: /AWD - MOF - Search - Biofarm/i })).not.toHaveTextContent(/by name/);
  });
});

describe("TrafficPage and EventsPage", () => {
  it("traffic shows sessions, conversion and channels", () => {
    resetNavigation("/traffic");
    wrap(<TrafficPage />);
    expect(screen.getByText("GA4 sessions, all channels")).toBeInTheDocument();
    expect(screen.getByText("Visit to enquiry rate")).toBeInTheDocument();
    expect(screen.queryByText(/session to enquiry/i)).not.toBeInTheDocument();
    const channels = screen.getByRole("table", { name: /sessions by channel/i });
    expect(within(channels).getByText("Organic search")).toBeInTheDocument();
    expect(within(channels).getByRole("columnheader", { name: /vs sep 2026/i })).toBeInTheDocument();
    expect(screen.getByText(/paid share/i)).toBeInTheDocument();
  });

  it("names channels as the Sources page does and shows a dash for small channels' change", () => {
    resetNavigation("/traffic");
    wrap(<TrafficPage />);
    const table = screen.getByRole("table", { name: /sessions by channel/i });
    for (const name of ["Paid search", "Organic search", "LinkedIn ads", "LinkedIn posts", "Newsletter", "AI search", "Direct/unknown", "Referral"]) {
      expect(within(table).getByRole("row", { name: new RegExp(`^${name.replace("/", "\\/")}\\b`) })).toBeInTheDocument();
    }
    for (const old of ["Paid social", "Organic social", "Email", "AI assistant"]) expect(within(table).queryByText(old)).not.toBeInTheDocument();
    expect(within(table).queryByText(/^Direct$/)).not.toBeInTheDocument();
    // the demo AI search channel has 13 sessions in Oct 2026, under the 50-session minimum
    const small = within(table).getByRole("row", { name: /^AI search\b/ });
    expect(within(small).getAllByRole("cell").map((c) => c.textContent)).toContain("–");
    const big = within(table).getByRole("row", { name: /^Organic search\b/ });
    expect(within(big).getAllByRole("cell").map((c) => c.textContent)).toContain("−23%");
    expect(screen.getByText("Change is shown for channels with at least 50 sessions.")).toBeInTheDocument();
  });

  it("traffic cards show one number, one change and one short line each, with the rest behind the icon", async () => {
    resetNavigation("/traffic");
    wrap(<TrafficPage />);
    expect(screen.getByTestId("kpi-sessions")).toHaveTextContent(/^Sessions[\d,]+[−+±][\d,]+ vs Sep 2026GA4 sessions, all channels$/);
    expect(screen.getByTestId("kpi-visit-rate")).toHaveTextContent(/^Visit to enquiry rate\d+\.\d%[−+±]\d+\.\d pts vs Sep 2026Sessions that became an enquiry$/);
    expect(screen.getByTestId("kpi-biggest-channel")).toHaveTextContent(/^Biggest channel[A-Za-z ]+\d+% of sessions$/);
    expect(screen.getByTestId("kpi-paid-share")).toHaveTextContent(/^Paid share\d+%Paid search and paid social$/);
    expect(screen.queryByText(/Oct 2025/)).not.toBeInTheDocument();
    expect(screen.queryByText(/enquiries from [\d,]+ sessions/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/÷/)).not.toBeInTheDocument();
    fireEvent.mouseOver(screen.getByRole("button", { name: /^about sessions$/i }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/Oct 2025: [\d,]+/);
  });

  it("sessions by month carries the same notes as the overview chart, with the same list and form under it", () => {
    resetNavigation("/traffic");
    wrap(<TrafficPage />);
    const figure = screen.getByRole("figure", { name: /sessions by month/i });
    expect(within(figure).getByText("LinkedIn campaign started")).toBeInTheDocument();
    expect(within(figure).getByText("Agency search campaigns restructured")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: /^notes$/i });
    expect(within(list).getByText("LinkedIn campaign started")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/what happened/i), { target: { value: "Site relaunch" } });
    fireEvent.click(screen.getByRole("button", { name: /add note/i }));
    expect(within(list).getByText("Site relaunch")).toBeInTheDocument();
    expect(within(figure).getByText("Site relaunch")).toBeInTheDocument();
  });

  it("events lists the window's events with totals", () => {
    resetNavigation("/events");
    wrap(<EventsPage />);
    expect(screen.getByText(/leads from events/i)).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: /^events$/i })).getByText(/futurebuild 2026/i)).toBeInTheDocument();
  });

  it("events table shows cost and cost per qualified, with a dash where there is no cost or nothing qualified, and marks young events maturing", () => {
    resetNavigation("/events");
    wrap(<EventsPage />);
    const table = screen.getByRole("table", { name: /^events$/i });
    expect(within(table).getByRole("columnheader", { name: "Cost" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Cost per qualified" })).toBeInTheDocument();
    const futurebuild = within(table).getByRole("row", { name: /futurebuild 2026/i });
    const fbCells = within(futurebuild).getAllByRole("cell").map((c) => c.textContent);
    expect(fbCells).toContain("£4,800");
    expect(fbCells.some((c) => /^£[\d,]+$/.test(c ?? "") && c !== "£4,800")).toBe(true);
    expect(futurebuild).not.toHaveTextContent(/maturing/i);
    const webinar = within(table).getByRole("row", { name: /webinar: nsip/i });
    expect(within(webinar).getAllByRole("cell").filter((c) => c.textContent === "–")).toHaveLength(2);
    const breakfast = within(table).getByRole("row", { name: /landowner breakfast/i });
    expect(breakfast).toHaveTextContent(/maturing/i);
    expect(screen.getByText(/maturing events are younger than 150 days/i)).toBeInTheDocument();
  });

  it("events show cost per qualified from the events that have a cost, with one short line and the rest behind the icon", async () => {
    resetNavigation("/events");
    wrap(<EventsPage />);
    const card = screen.getByTestId("kpi-event-cpqo");
    expect(card).toHaveTextContent(/^Cost per qualified from events£[\d,]+4 of 6 events have a cost$/);
    fireEvent.mouseOver(screen.getByRole("button", { name: /^about cost per qualified from events$/i }));
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent(/last 12 months/i);
    expect(tip).toHaveTextContent(/stand, travel and any fees/i);
    expect(tip).toHaveTextContent(/£[\d,]+ · \d+ qualified/);
  });

  it("events get their cost through the row's edit dialog, which feeds the card and the table", () => {
    resetNavigation("/events");
    wrap(<EventsPage />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/cost \(£\)/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^edit webinar: nsip biodiversity gain$/i }));
    const dialog = screen.getByRole("dialog", { name: /^edit event$/i });
    expect(within(dialog).getByLabelText(/^name$/i)).toHaveValue("Webinar: NSIP biodiversity gain");
    fireEvent.change(within(dialog).getByLabelText(/cost \(£\)/i), { target: { value: "0" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    expect(within(dialog).getByText(/enter a cost above zero, or leave it blank/i)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/cost \(£\)/i), { target: { value: "250" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("kpi-event-cpqo")).toHaveTextContent(/5 of 6 events have a cost$/);
    const row = within(screen.getByRole("table", { name: /^events$/i })).getByRole("row", { name: /webinar: nsip/i });
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toContain("£250");
  });

  it("events are added from a button beside the export, in a dialog, and a session-added event can be removed from its edit dialog", () => {
    resetNavigation("/events");
    wrap(<EventsPage />);
    const add = screen.getByRole("button", { name: /^add event$/i });
    expect(add.closest("[data-print='hide']")).not.toBeNull();
    fireEvent.click(add);
    const dialog = screen.getByRole("dialog", { name: /^add an event$/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    expect(within(dialog).getByText(/give the event a name/i)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/^name$/i), { target: { value: "Landowner evening, Wells" } });
    fireEvent.change(within(dialog).getByLabelText(/^date$/i), { target: { value: "2026-10-14" } });
    fireEvent.change(within(dialog).getByLabelText(/^type$/i), { target: { value: "cpd" } });
    fireEvent.change(within(dialog).getByLabelText(/^attendees$/i), { target: { value: "22" } });
    fireEvent.change(within(dialog).getByLabelText(/^leads$/i), { target: { value: "6" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const table = screen.getByRole("table", { name: /^events$/i });
    const row = within(table).getByRole("row", { name: /landowner evening, wells/i });
    expect(row).toHaveTextContent(/14 Oct 2026 · CPD session · Maturing/);
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(expect.arrayContaining(["22", "6", "0", "–", "–"]));
    expect(screen.getByTestId("kpi-event-cpqo")).toHaveTextContent(/4 of 7 events have a cost$/);
    fireEvent.click(within(row).getByRole("button", { name: /^edit landowner evening, wells$/i }));
    const edit = screen.getByRole("dialog", { name: /^edit event$/i });
    fireEvent.click(within(edit).getByRole("button", { name: /^remove event$/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(table).queryByText(/landowner evening, wells/i)).not.toBeInTheDocument();
    fireEvent.click(within(table).getByRole("button", { name: /^edit futurebuild 2026, excel london$/i }));
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: /^remove event$/i })).not.toBeInTheDocument();
  });

  it("events refuse a date in the future", () => {
    resetNavigation("/events");
    wrap(<EventsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^add event$/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^name$/i), { target: { value: "Futurebuild 2027" } });
    fireEvent.change(within(dialog).getByLabelText(/^date$/i), { target: { value: "2027-03-03" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    expect(within(dialog).getByText(/after the event has happened/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /^cancel$/i }));
    expect(within(screen.getByRole("table", { name: /^events$/i })).queryByText(/futurebuild 2027/i)).not.toBeInTheDocument();
  });

  it("events ask for costs when none have been entered", () => {
    resetNavigation("/events");
    render(
      <DashboardProvider data={{ ...data, events: data.events.map((x) => ({ ...x, costGbp: null })) }} config={kpiConfig}>
        <EventsPage />
      </DashboardProvider>,
    );
    expect(screen.getByTestId("kpi-event-cpqo")).toHaveTextContent(/^Cost per qualified from eventsAdd event costs to see this$/);
  });
});

describe("AlertsPage, DataQualityPage, ReportPage", () => {
  it("alerts are split into data and performance, each rule that fired has a link, and the rules are listed with the switched-off one marked", () => {
    resetNavigation("/alerts");
    wrap(<AlertsPage />);
    expect(screen.getByRole("heading", { level: 1, name: /alerts/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /^data$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /^performance$/i })).toBeInTheDocument();
    const lists = screen.getAllByRole("list", { name: /^(data|performance) alerts$/i });
    expect(lists).toHaveLength(2);
    const items = lists.flatMap((l) => within(l).queryAllByRole("listitem"));
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(within(item).getByRole("link", { name: /go there/i })).toBeInTheDocument();
    expect(screen.getAllByText(/no new data from pipedrive for 2 days/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/off until the field exists in pipedrive/i)).toBeInTheDocument();
    expect(screen.queryByText(/no reply logged/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nightly/i)).not.toBeInTheDocument();
  });

  it("data quality shows three gap cards and the deals to fix, each deal linking to Pipedrive", () => {
    resetNavigation("/data-quality");
    wrap(<DataQualityPage />);
    expect(screen.getByText(/deals without a source channel/i)).toBeInTheDocument();
    expect(screen.getByText(/website deals without attribution/i)).toBeInTheDocument();
    expect(screen.getByText(/enquiries without a pipedrive person/i)).toBeInTheDocument();
    // quality counts cover inbound enquiries only: the team's outbound records are not expected to carry a person or a reply
    const data = buildDemoData();
    const window = monthRange(DEMO_LAST_MONTH, 12);
    const inbound = data.enquiries.filter((e) => window.includes(e.createdAt.slice(0, 7)) && e.channel !== null && kpiConfig.inboundChannels.includes(e.channel)).length;
    expect(screen.getByText(new RegExp(`of ${inbound.toLocaleString("en-GB")} enquiries`))).toBeInTheDocument();
    expect(screen.queryByText("Speed to lead")).not.toBeInTheDocument();
    expect(screen.queryByText(/no reply logged/i)).not.toBeInTheDocument();
    const table = screen.getByRole("table", { name: /deals without a source channel/i });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    const link = within(rows[0]).getByRole("link");
    expect(link).toHaveAttribute("href", expect.stringMatching(/^https:\/\/[a-z0-9-]+\.pipedrive\.com\/deal\/\d+$/));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText(/the dashboard updates automatically once it's fixed/i)).toBeInTheDocument();
    expect(screen.queryByText(/next sync/i)).not.toBeInTheDocument();
  });

  it("report renders the one-pager with a short summary, keeps copy, print and export, and hides email delivery", () => {
    resetNavigation("/report");
    wrap(<ReportPage />);
    expect(screen.getByRole("article", { name: /marketing report, oct 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy summary/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /print/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/recipients/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^delivery$/i })).not.toBeInTheDocument();
    const words = document.querySelector("pre")!.textContent!.trim().split("\n");
    expect(words[0]).toBe("Marketing, Oct 2026");
    expect(words.length).toBeLessThanOrEqual(6);
  });
});

describe("KpiRulePage targets", () => {
  function both() {
    resetNavigation("/kpi-rule");
    return render(
      <DashboardProvider data={data} config={kpiConfig}>
        <KpiRulePage />
        <OverviewPage />
      </DashboardProvider>,
    );
  }

  it("changing the target changes the overview tooltip and logs who, old, new and when", async () => {
    both();
    const field = screen.getByLabelText(/qualified a month by jan 2027/i);
    fireEvent.change(field, { target: { value: "15" } });
    fireEvent.blur(field);
    expect(screen.getByTestId("kpi-qualified")).not.toHaveTextContent(/target/i);
    fireEvent.mouseOver(screen.getByRole("button", { name: /^about qualified opportunities$/i }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/Target 15/);
    const log = screen.getByRole("table", { name: /target changes/i });
    const row = within(log).getAllByRole("row")[1];
    expect(row).toHaveTextContent(/Godswill William/);
    expect(row).toHaveTextContent(/Qualified a month by Jan 2027/);
    expect(row).toHaveTextContent(/12/);
    expect(row).toHaveTextContent(/15/);
    expect(row).toHaveTextContent(/\d{1,2} \w{3} \d{4}/);
  });

  it("logs nothing for a value that did not change or is not valid", () => {
    both();
    const field = screen.getByLabelText(/brand searches a month/i);
    fireEvent.change(field, { target: { value: "90" } });
    fireEvent.blur(field);
    fireEvent.change(field, { target: { value: "0" } });
    fireEvent.blur(field);
    expect(screen.getByRole("table", { name: /target changes/i })).toHaveTextContent(/no changes yet/i);
    expect(field).toHaveValue(90);
  });

  it("the data status card notes that leads converted before the mirror existed carry their conversion date", () => {
    both();
    expect(screen.getByText(/Enquiries that were converted to deals before 8 Nov 2026 carry the date they became a deal/i)).toBeInTheDocument();
  });

  it("switching a draft check on recalculates the overview", () => {
    both();
    const count = () => Number(within(screen.getByTestId("kpi-qualified")).getByText(/^\d+$/).textContent);
    const before = count();
    for (const name of [/it's a buyer/i, /real project/i, /we can serve it/i, /right habitat/i, /realistic timing/i]) {
      fireEvent.click(screen.getByRole("switch", { name }));
    }
    expect(count()).toBeLessThan(before);
    expect(count()).toBeGreaterThan(0);
  });
});
