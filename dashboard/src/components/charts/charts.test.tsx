import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarTable } from "@/components/charts/BarTable";
import { CohortHeatmap } from "@/components/charts/CohortHeatmap";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { JoinedLeftChart } from "@/components/charts/JoinedLeftChart";
import { MeterList } from "@/components/charts/MeterList";
import { KpiCard } from "@/components/KpiCard";
import { TrendChart } from "@/components/TrendChart";

describe("MeterList", () => {
  const rows = [
    { key: "paid", label: "Paid search", value: 26, valueText: "26", fill: 6, fillText: "6 qualified · 23%" },
    { key: "organic", label: "Organic search", value: 13, valueText: "13", fill: 0, fillText: "0 qualified" },
  ];

  it("renders a row per item with label, value and the detail text, and a meter sized to the largest value", () => {
    render(<MeterList ariaLabel="Enquiries by source" rows={rows} />);
    const list = screen.getByRole("list", { name: /enquiries by source/i });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Paid search")).toBeInTheDocument();
    expect(within(items[0]).getByText("26")).toBeInTheDocument();
    expect(within(items[0]).getByText("6 qualified · 23%")).toBeInTheDocument();
    expect(within(items[0]).getByTestId("meter-track")).toHaveStyle({ width: "100%" });
    expect(within(items[1]).getByTestId("meter-track")).toHaveStyle({ width: "50%" });
    expect(within(items[0]).getByTestId("meter-fill")).toHaveStyle({ width: `${(6 / 26) * 100}%` });
  });

  it("says so when there is nothing to show", () => {
    render(<MeterList ariaLabel="x" rows={[]} emptyText="Nothing yet" />);
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
  });
});

describe("CohortHeatmap", () => {
  const rows = [
    { month: "2026-05", enquiries: 20, base: 20, qualifiedBy: { 30: 2, 90: 5, 150: 6 }, mature: true },
    { month: "2026-09", enquiries: 25, base: 25, qualifiedBy: { 30: 1, 90: 2, 150: 2 }, mature: false },
  ];

  it("shows a percentage per cell with the count in the tooltip, and marks immature cohorts", () => {
    render(<CohortHeatmap rows={rows} horizons={[30, 90, 150]} />);
    const grid = screen.getByRole("table", { name: /qualified, by enquiry month/i });
    expect(within(grid).getByText("30%")).toHaveAttribute("title", "6 of 20 lead enquiries qualified within 150 days");
    expect(within(grid).getByText("May 2026")).toBeInTheDocument();
    expect(within(grid).getAllByText(/maturing/i)).toHaveLength(1);
    expect(within(grid).getByRole("columnheader", { name: /150 days/i })).toBeInTheDocument();
  });

  it("uses short column headers in compact mode", () => {
    render(<CohortHeatmap compact rows={rows} horizons={[30, 90, 150]} />);
    expect(screen.getByRole("columnheader", { name: "150 d" })).toBeInTheDocument();
  });

  it("tints cells darker as the share rises", () => {
    render(<CohortHeatmap rows={rows} horizons={[30, 90, 150]} />);
    const low = screen.getByText("4%").closest("td")!;
    const high = screen.getByText("30%").closest("td")!;
    expect(Number(high.getAttribute("data-step"))).toBeGreaterThan(Number(low.getAttribute("data-step")));
  });
});

describe("ColumnChart", () => {
  it("renders an accessible figure with the chart", () => {
    const { container } = render(<ColumnChart months={["2026-09", "2026-10"]} values={[3, 5]} label="Enquiries" />);
    expect(screen.getByRole("figure", { name: /enquiries/i })).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("draws notes pinned to months on the plot and leaves out notes for other months", () => {
    render(
      <ColumnChart
        months={["2026-09", "2026-10"]}
        values={[3, 5]}
        label="Sessions by month"
        annotations={[
          { id: "a", month: "2026-10", text: "LinkedIn campaign started" },
          { id: "b", month: "2026-03", text: "Site relaunch" },
        ]}
      />,
    );
    const figure = screen.getByRole("figure", { name: /sessions by month/i });
    expect(within(figure).getByText("LinkedIn campaign started")).toBeInTheDocument();
    expect(within(figure).queryByText("Site relaunch")).not.toBeInTheDocument();
  });
});

describe("JoinedLeftChart", () => {
  it("draws joined up and left down with the net change written above each month", () => {
    const { container } = render(<JoinedLeftChart months={["2026-09", "2026-10"]} joined={[12, 7]} left={[4, 9]} label="Joined and left by month" />);
    const figure = screen.getByRole("figure", { name: /joined and left by month/i });
    expect(within(figure).getByText("+8")).toBeInTheDocument();
    expect(within(figure).getByText("−2")).toBeInTheDocument();
    expect(within(figure).getByText("Joined")).toBeInTheDocument();
    expect(within(figure).getByText("Left")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("TrendChart", () => {
  it("draws the same notes the same way", () => {
    render(
      <TrendChart
        rows={[
          { month: "2026-09", inbound: 3, network: 1, unattributed: 0 },
          { month: "2026-10", inbound: 5, network: 0, unattributed: 0 },
        ]}
        annotations={[{ id: "a", month: "2026-10", text: "LinkedIn campaign started" }]}
      />,
    );
    expect(within(screen.getByRole("figure")).getByText("LinkedIn campaign started")).toBeInTheDocument();
  });
});

describe("KpiCard trend", () => {
  it("draws a sparkline when a series is given", () => {
    const { container } = render(<KpiCard label="x" value="5" footnote="f" trend={[1, 2, 3, 5]} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("KpiCard skeleton", () => {
  it("reserves the change row even when empty, so cards in a row line up, and needs no footnote", () => {
    render(<KpiCard label="Paid share" value="38%" />);
    expect(screen.getByTestId("kpi-delta")).toBeEmptyDOMElement();
    expect(screen.queryByTestId("kpi-detail")).not.toBeInTheDocument();
    expect(screen.queryByTestId("kpi-footnote")).not.toBeInTheDocument();
  });

  it("takes a plain comparison line in the change row for values that are words", () => {
    render(<KpiCard textValue label="Best converting" value="Paid search" compare="57% of 23 qualified" />);
    expect(screen.getByTestId("kpi-delta")).toHaveTextContent("57% of 23 qualified");
  });

  it("shows a multi-line explanation as separate lines in the tooltip", async () => {
    render(<KpiCard label="Enquiries" value="20" info={["Website form submissions in October.", "Last 3 months: 71 · Oct 2025: 21."]} />);
    fireEvent.mouseOver(screen.getByRole("button", { name: /about enquiries/i }));
    const tip = await screen.findByRole("tooltip");
    expect(within(tip).getByText("Website form submissions in October.")).toBeInTheDocument();
    expect(within(tip).getByText("Last 3 months: 71 · Oct 2025: 21.")).toBeInTheDocument();
  });

  it("fills the rows when given a change and a detail", () => {
    render(<KpiCard label="Enquiries" value="71" delta={{ value: -3, note: "vs Sep 2026" }} detail="Oct 2025: 59" footnote="Website forms" />);
    expect(screen.getByTestId("kpi-delta")).toHaveTextContent("−3 vs Sep 2026");
    expect(screen.getByTestId("kpi-detail")).toHaveTextContent("Oct 2025: 59");
  });
});

describe("KpiCard info", () => {
  it("keeps the longer explanation behind an info icon that shows it on hover and focus", async () => {
    render(<KpiCard label="Enquiries" value="71" footnote="Website forms" info="Every submission of the website forms, via the enquiry API." />);
    expect(screen.queryByText(/every submission/i)).not.toBeInTheDocument();
    const icon = screen.getByRole("button", { name: /about enquiries/i });
    fireEvent.mouseOver(icon);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/every submission of the website forms/i);
  });
});

describe("BarTable", () => {
  it("puts a row's action in its own trailing column and can space the rows out", () => {
    render(
      <BarTable
        ariaLabel="Events"
        labelHeader="Event"
        barHeader="Leads"
        columns={["Leads"]}
        comfortable
        rows={[
          { key: "a", label: "Futurebuild", total: 25, cells: ["25"], action: <button type="button" aria-label="Edit Futurebuild" /> },
          { key: "b", label: "Webinar", total: 5, cells: ["5"] },
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: "Events" });
    expect(table).toHaveAttribute("data-spacing", "comfortable");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    expect(within(within(table).getByRole("row", { name: /futurebuild/i })).getByRole("button", { name: "Edit Futurebuild" })).toBeInTheDocument();
    expect(within(within(table).getByRole("row", { name: /webinar/i })).getAllByRole("cell")).toHaveLength(3);
  });

  it("prints one row per item with aligned numbers and a bar sized to the largest", () => {
    render(
      <BarTable
        ariaLabel="Enquiries by source"
        labelHeader="Source"
        barHeader="Enquiries"
        columns={["Enquiries", "Qualified", "Conversion"]}
        rows={[
          { key: "a", label: "Organic search", total: 18, fill: 4, cells: ["18", "4", "22%"] },
          { key: "b", label: "Direct", total: 9, fill: 3, cells: ["9", "3", "33%"] },
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: /enquiries by source/i });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("Organic search")).toBeInTheDocument();
    expect(within(rows[1]).getByText("22%")).toBeInTheDocument();
    expect(within(rows[1]).getByTestId("bar-total")).toHaveStyle({ width: "100%" });
    expect(within(rows[2]).getByTestId("bar-total")).toHaveStyle({ width: "50%" });
    expect(within(rows[2]).getByTestId("bar-fill")).toHaveStyle({ width: `${(3 / 9) * 100}%` });
    expect(within(table).getByRole("columnheader", { name: "Conversion" })).toBeInTheDocument();
  });

  it("draws a solid bar when a row has no fill, and a trend column when rows carry one", () => {
    render(
      <BarTable
        ariaLabel="Sessions by channel"
        labelHeader="Channel"
        barHeader="Sessions"
        columns={["Sessions"]}
        trendHeader="12 months"
        rows={[
          { key: "a", label: "Organic search", total: 400, cells: ["400"], trend: [300, 350, 400] },
          { key: "b", label: "Direct", total: 100, cells: ["100"], trend: [90, 95, 100] },
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: /sessions by channel/i });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByTestId("bar-fill")).toHaveStyle({ width: "100%" });
    expect(within(rows[2]).getByTestId("bar-total")).toHaveStyle({ width: "25%" });
    expect(within(table).getByRole("columnheader", { name: "12 months" })).toBeInTheDocument();
    expect(within(rows[1]).getByTestId("bar-trend")).toBeInTheDocument();
  });

  it("collapses child rows behind a toggle on the parent, scaled to the same bar", () => {
    render(
      <BarTable
        ariaLabel="Enquiries by source"
        labelHeader="Source"
        barHeader="Enquiries"
        columns={["Enquiries", "Qualified"]}
        childNoun="platforms"
        rows={[{ key: "paid", label: "Paid search", total: 20, fill: 5, cells: ["20", "5"], children: [{ key: "g", label: "Google Ads", total: 15, fill: 4, cells: ["15", "4"] }] }]}
      />,
    );
    expect(screen.queryByText("Google Ads")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /show paid search platforms/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const child = screen.getByRole("row", { name: /google ads/i });
    expect(within(child).getByTestId("bar-total")).toHaveStyle({ width: "75%" });
    fireEvent.click(screen.getByRole("button", { name: /hide paid search platforms/i }));
    expect(screen.queryByText("Google Ads")).not.toBeInTheDocument();
  });

  it("lets a caller narrow the bar column and fix its scale, so rates fill their share of the whole", () => {
    render(<BarTable ariaLabel="Issues" labelHeader="Subject" barHeader="Opened" barWidth="22%" max={1} dense columns={["Opens"]} rows={[{ key: "a", label: "Issue", sublabel: "15 Oct 2026 · 927 recipients", total: 0.4, fill: 0.05, cells: ["40%"] }]} />);
    expect(screen.getByRole("columnheader", { name: "Opened" })).toHaveStyle({ width: "22%" });
    expect(screen.getByRole("columnheader", { name: "Subject" })).toHaveStyle({ paddingLeft: "8px" });
    expect(screen.getByTestId("bar-total")).toHaveStyle({ width: "40%" });
    expect(screen.getByRole("rowheader", { name: /issue 15 oct 2026 · 927 recipients/i })).toBeInTheDocument();
  });
});


describe("CohortHeatmap qualified share minimum", () => {
  it("shows a dash instead of a share for a month with fewer enquiries than the minimum", () => {
    render(
      <CohortHeatmap
        rows={[
          { month: "2026-05", enquiries: 3, base: 3, qualifiedBy: { 30: 3 }, mature: true },
          { month: "2026-06", enquiries: 9, base: 8, qualifiedBy: { 30: 2 }, mature: true }, // one directly created deal: counted, not in the share
        ]}
        horizons={[30]}
        minEnquiries={5}
      />,
    );
    const grid = screen.getByRole("table", { name: /qualified, by enquiry month/i });
    const rows = within(grid).getAllByRole("row").slice(1);
    expect(within(rows[0]).getAllByRole("cell").map((c) => c.textContent)).toContain("–");
    expect(within(rows[1]).getAllByRole("cell").map((c) => c.textContent)).toContain("25%");
  });
});
