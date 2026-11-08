import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { KpiCard } from "@/components/KpiCard";
import { SpendDialog } from "@/components/SpendDialog";
import { SpendImport } from "@/components/SpendImport";
import { SpendPanel } from "@/components/SpendPanel";

describe("KpiCard", () => {
  it("shows the label, value, progress to target and where the number came from", () => {
    render(
      <KpiCard
        label="Qualified inbound opportunities"
        value="9"
        detail="October 2026"
        progress={{ value: 9, target: 12 }}
        footnote="Pipedrive deals, demo data"
      />,
    );
    expect(screen.getByText("Qualified inbound opportunities")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
    expect(screen.getByText(/target 12/)).toBeInTheDocument();
    expect(screen.getByText("Pipedrive deals, demo data")).toBeInTheDocument();
  });

  it("caps the progress bar at 100% when the target is beaten", () => {
    render(<KpiCard label="x" value="15" progress={{ value: 15, target: 12 }} footnote="f" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});

describe("SpendPanel", () => {
  const months = ["2026-09", "2026-10"];

  it("has no add form of its own any more; adding happens in the dialog", () => {
    render(<SpendPanel months={months} entries={[]} />);
    expect(screen.queryByLabelText(/amount/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add spend/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^month$/i)).toBeInTheDocument();
  });

  it("spaces its rows out like the events table", () => {
    render(<SpendPanel months={months} entries={[{ id: "1", month: "2026-10", platform: "google_ads", campaign: "A", amountGbp: 1000 }]} />);
    expect(screen.getByRole("table", { name: /media spend, oct 2026/i })).toHaveAttribute("data-spacing", "comfortable");
  });

  it("lists existing entries for the chosen month with a total", () => {
    render(
      <SpendPanel
        months={months}
        entries={[
          { id: "1", month: "2026-10", platform: "google_ads", campaign: "A", amountGbp: 1000 },
          { id: "2", month: "2026-10", platform: "microsoft_ads", campaign: "B", amountGbp: 250 },
          { id: "3", month: "2026-09", platform: "google_ads", campaign: "C", amountGbp: 999 },
        ]}
      />,
    );
    const list = screen.getByRole("table", { name: /media spend, oct 2026/i });
    expect(within(list).getByText("Google Ads")).toBeInTheDocument();
    expect(within(list).getByText("Microsoft Ads")).toBeInTheDocument();
    expect(within(list).queryByText("C")).not.toBeInTheDocument();
    expect(within(list).getByText("£1,250")).toBeInTheDocument();
  });

  it("removes a line when asked", () => {
    const onRemove = vi.fn();
    render(
      <SpendPanel
        months={months}
        entries={[{ id: "1", month: "2026-10", platform: "google_ads", campaign: "A", amountGbp: 1000 }]}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /remove google ads a/i }));
    expect(onRemove).toHaveBeenCalledWith("1");
  });

});

describe("SpendDialog", () => {
  const months = ["2026-09", "2026-10"];

  it("adds a validated entry and reports it to the parent", () => {
    const onAdd = vi.fn();
    render(<SpendDialog open months={months} onClose={() => {}} onAdd={onAdd} />);
    const dialog = screen.getByRole("dialog", { name: /^add spend$/i });
    fireEvent.change(within(dialog).getByLabelText(/campaign/i), { target: { value: "Search - Biofarm" } });
    fireEvent.change(within(dialog).getByLabelText(/amount/i), { target: { value: "1250.50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    expect(onAdd).toHaveBeenCalledWith({ month: "2026-10", platform: "google_ads", campaign: "Search - Biofarm", amountGbp: 1250.5 });
  });

  it("refuses an empty or negative amount", () => {
    const onAdd = vi.fn();
    render(<SpendDialog open months={months} onClose={() => {}} onAdd={onAdd} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/enter an amount/i)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/amount/i), { target: { value: "-5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe("SpendImport", () => {
  it("imports a CSV, passes the good lines up and reports what was skipped", async () => {
    const onImport = vi.fn();
    const onResult = vi.fn();
    render(<SpendImport months={["2026-09", "2026-10"]} onImport={onImport} onResult={onResult} />);
    expect(screen.getByRole("button", { name: /import csv/i })).toBeInTheDocument();
    const file = new File(["month,platform,campaign,amount\n2026-10,Google Ads,Search,1200\n2026-10,Facebook,x,10\n"], "spend.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/spend csv file/i), { target: { files: [file] } });
    await vi.waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(onImport).toHaveBeenCalledWith([{ month: "2026-10", platform: "google_ads", campaign: "Search", amountGbp: 1200 }]);
    expect(onResult.mock.calls[0][0]).toMatchObject({ added: 1 });
    expect(onResult.mock.calls[0][0].errors).toHaveLength(1);
  });
});
