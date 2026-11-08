import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DashboardError from "./error";
import Loading from "./loading";
import NotFound from "../not-found";

describe("page states", () => {
  it("loading shows a labelled placeholder", () => {
    render(<Loading />);
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
  });

  it("error shows the message, the digest and a retry that calls reset", () => {
    const reset = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<DashboardError error={Object.assign(new Error("Pipedrive sync failed"), { digest: "abc123" })} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/pipedrive sync failed/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/abc123/);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("not found points back to the overview", () => {
    render(<NotFound />);
    expect(screen.getByRole("link", { name: /back to overview/i })).toHaveAttribute("href", "/");
  });
});
