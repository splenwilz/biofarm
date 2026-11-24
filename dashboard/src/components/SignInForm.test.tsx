import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Server Action is a module boundary; in the browser it is a POST. Here it is a function that answers like one.
const signIn = vi.fn<(prev: { error?: string }, data: FormData) => Promise<{ error?: string }>>();
vi.mock("@/auth/actions", () => ({ signIn: (prev: { error?: string }, data: FormData) => signIn(prev, data) }));

import { SignInForm } from "@/components/SignInForm";

describe("SignInForm", () => {
  beforeEach(() => signIn.mockReset());

  it("asks for one password, labelled, and tells the browser which field it is", () => {
    render(<SignInForm next="/" year={2026} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sign in");
    // one wordmark per layout (panel from md up, centred above the form below); CSS shows exactly one
    expect(screen.getAllByRole("img", { name: "Biofarm" })).toHaveLength(2);
    expect(screen.getByText(/for the biofarm team/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/control/i);
    expect(screen.getByText("© 2026 Biofarm")).toBeInTheDocument();
    const field = screen.getByLabelText(/^password$/i);
    expect(field).toHaveAttribute("type", "password");
    expect(field).toHaveAttribute("autocomplete", "current-password");
    expect(field).toHaveAttribute("name", "password");
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("can show the password while typing; the button's label says what it will do next", () => {
    render(<SignInForm next="/" year={2026} />);
    const field = screen.getByLabelText(/^password$/i);
    const toggle = screen.getByRole("button", { name: "Show password" });
    // a label that changes with the state must not also carry aria-pressed (ARIA APG, button pattern)
    expect(toggle).not.toHaveAttribute("aria-pressed");
    fireEvent.click(toggle);
    expect(field).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).not.toHaveAttribute("aria-pressed");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(field).toHaveAttribute("type", "password");
  });

  it("keeps the caret in the field when the eye is pressed", () => {
    render(<SignInForm next="/" year={2026} />);
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("type", "button");
    const down = fireEvent.mouseDown(toggle);
    const up = fireEvent.mouseUp(toggle);
    // fireEvent returns false when the handler called preventDefault
    expect(down).toBe(false);
    expect(up).toBe(false);
  });

  it("carries the page to return to in a hidden field", () => {
    const { container } = render(<SignInForm next="/spend?month=2026-10" year={2026} />);
    expect(container.querySelector('input[name="next"]')).toHaveValue("/spend?month=2026-10");
  });

  it("shows the action's message as an alert tied to the field, and clears it on a new attempt", async () => {
    signIn.mockResolvedValueOnce({ error: "That password is not right." });
    render(<SignInForm next="/spend?month=2026-10" year={2026} />);
    const field = screen.getByLabelText(/^password$/i);
    fireEvent.change(field, { target: { value: "guess" } });
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That password is not right."));
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", screen.getByRole("alert").id);
    const [, data] = signIn.mock.calls[0]!;
    expect(data.get("password")).toBe("guess");
    expect(data.get("next")).toBe("/spend?month=2026-10");
    signIn.mockResolvedValueOnce({});
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
