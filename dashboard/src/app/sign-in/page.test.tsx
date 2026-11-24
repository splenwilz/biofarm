// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const connection = vi.fn(async () => {});
vi.mock("next/server", () => ({ connection: () => connection() }));

import type { ReactElement } from "react";

import SignInPage from "@/app/sign-in/page";
import { SignInForm } from "@/components/SignInForm";

type Props = Parameters<typeof SignInPage>[0];
type FormElement = ReactElement<{ next: string; year: number }>;

/** The page is a Suspense boundary around one async gate; render the gate the way the server would. */
async function gateOutput(search: Record<string, string | string[] | undefined>) {
  const page = SignInPage({ searchParams: Promise.resolve(search), params: Promise.resolve({}) } as Props);
  const gate = page.props.children as { type: (p: unknown) => Promise<FormElement>; props: unknown };
  return gate.type(gate.props);
}

describe("sign-in page", () => {
  it("is request-bound before it reads the year, and hands the form the year and a safe next path", async () => {
    connection.mockClear();
    const el = await gateOutput({ next: "/spend?month=2026-10" });
    expect(connection).toHaveBeenCalledTimes(1);
    expect(el.type).toBe(SignInForm);
    expect(el.props).toEqual({ next: "/spend?month=2026-10", year: new Date().getFullYear() });
  });

  it("takes the first of a repeated next and drops an off-site one", async () => {
    expect((await gateOutput({ next: ["/events", "/evil"] })).props.next).toBe("/events");
    expect((await gateOutput({ next: "https://evil.example/" })).props.next).toBe("/");
    expect((await gateOutput({})).props.next).toBe("/");
  });
});
