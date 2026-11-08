import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { kpiConfig } from "@/config/kpi";
import { buildDemoData } from "@/data/demo";
import { DashboardProvider } from "@/components/DashboardProvider";
import { AppShell } from "@/components/shell/AppShell";
import { navState, resetNavigation } from "@/test/navigation";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

const data = buildDemoData();

function renderShell() {
  return render(
    <DashboardProvider data={data} config={kpiConfig}>
      <AppShell>
        <p>page body</p>
      </AppShell>
    </DashboardProvider>,
  );
}

describe("AppShell", () => {
  beforeEach(() => resetNavigation());

  it("has a skip link, a primary navigation and the page content in main", () => {
    renderShell();
    expect(screen.getByRole("link", { name: /skip to content/i })).toHaveAttribute("href", "#dashboard-content");
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByText("page body")).toBeInTheDocument();
  });

  it("marks the current page in the sidebar", () => {
    resetNavigation("/sources");
    renderShell();
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(within(nav).getByRole("link", { name: "Sources" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the audience and month filters when moving between pages", () => {
    resetNavigation("/", "audience=developer&month=2026-09");
    renderShell();
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(within(nav).getByRole("link", { name: "Sources" })).toHaveAttribute("href", "/sources?audience=developer&month=2026-09");
  });

  it("links every page, newsletter and search included", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(within(nav).getByRole("link", { name: "Newsletter" })).toHaveAttribute("href", "/newsletter");
    expect(within(nav).getByRole("link", { name: "Search & AI" })).toHaveAttribute("href", "/search");
    expect(within(nav).queryByText(/v1\.1/i)).not.toBeInTheDocument();
  });

  it("the audience switcher rewrites the URL of the current page", () => {
    resetNavigation("/sources");
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /audience/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /landowners/i }));
    expect(navState.replace).toHaveBeenCalledWith("/sources?audience=landowner", { scroll: false });
  });

  it("the month selector rewrites the URL and lists the twelve months of data", () => {
    renderShell();
    expect(screen.queryByLabelText(/period ending/i)).not.toBeInTheDocument();
    const select = screen.getByLabelText(/^month$/i) as HTMLSelectElement;
    expect(select.options).toHaveLength(12);
    fireEvent.change(select, { target: { value: "2026-08" } });
    expect(navState.replace).toHaveBeenCalledWith("/?month=2026-08", { scroll: false });
  });

  it("says the numbers are demo data and when they were synced", () => {
    renderShell();
    expect(screen.getAllByText(/demo data/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/synced 1 Nov 2026/i)).toBeInTheDocument();
  });

  it("shows a demo data banner above every page, and none once live data is connected", () => {
    const { unmount } = renderShell();
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/demo data/i);
    expect(banner.compareDocumentPosition(screen.getByRole("main")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    render(
      <DashboardProvider data={{ ...data, source: "pipedrive" }} config={kpiConfig}>
        <AppShell>
          <p>page body</p>
        </AppShell>
      </DashboardProvider>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
