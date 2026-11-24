import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { safeNextPath } from "@/auth/sessionCodec";
import { SignInForm } from "@/components/SignInForm";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Outside the dashboard route group on purpose: no shell, no data load, so a
 * visitor without a session costs the lead API nothing. The `next` parameter
 * is request-time data under Cache Components, so it is read in a component
 * behind a Suspense boundary and the rest of the page prerenders; reading it
 * on the server (not with useSearchParams) keeps the form in the HTML, so the
 * page works before JavaScript loads.
 */
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <Suspense fallback={null}>
      <SignInGate searchParams={searchParams} />
    </Suspense>
  );
}

async function SignInGate({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const params = await searchParams;
  const raw = Array.isArray(params.next) ? params.next[0] : params.next;
  // The footer year is read at request time: under Cache Components a bare
  // `new Date()` during prerendering is an error (blocking-prerender-current-time),
  // and `connection()` is the documented way to mark what follows request-bound.
  await connection();
  return <SignInForm next={safeNextPath(raw)} year={new Date().getFullYear()} />;
}
