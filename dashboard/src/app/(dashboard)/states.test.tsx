import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FeedUnavailable } from "@/components/FeedUnavailable";

import DashboardError from "./error";
import Loading from "./loading";
import NotFound from "../not-found";

describe("page states", () => {
  it("feed unavailable shows the API's own explanation and a reload", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, writable: true, configurable: true });
    render(<FeedUnavailable message="Dashboard feed refused the request (503): Database schema is behind the code: run `alembic upgrade head`" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/schema is behind the code/);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

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
