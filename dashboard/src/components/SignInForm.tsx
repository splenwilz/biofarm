"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import OutlinedInput from "@mui/material/OutlinedInput";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Image from "next/image";
import { type MouseEvent, useActionState, useId, useState } from "react";

import { signIn, type SignInState } from "@/auth/actions";

/** What the dashboard holds, each one a page in the menu. */
const CONTENTS = [
  "Enquiries and qualified opportunities from Pipedrive",
  "Google and Microsoft Ads spend by campaign",
  "Website traffic, landing pages and form conversion",
  "Events, newsletter and search, month by month",
];

/** Twelve points (0 to 100) for the decorative preview card: a shape, not data. */
const PREVIEW_POINTS = [34, 42, 38, 52, 47, 58, 55, 66, 61, 72, 68, 80];
const PREVIEW_TARGET = 60;
const CHART = { w: 400, h: 150, top: 14, bottom: 12, right: 16 };
/** Value range the plot spans, so the curve uses the height instead of hugging a 0 baseline. */
const DOMAIN = { min: 20, max: 92 };
const GREEN_LINE = "#5F8468";

function chartY(v: number): number {
  const f = (v - DOMAIN.min) / (DOMAIN.max - DOMAIN.min);
  return CHART.top + (1 - f) * (CHART.h - CHART.top - CHART.bottom);
}

/** Smooth path through the points (Catmull-Rom turned into cubic Béziers), plus the closed area under it. */
function previewPaths(): { line: string; area: string; points: Array<[number, number]> } {
  const step = (CHART.w - CHART.right) / (PREVIEW_POINTS.length - 1);
  const pts = PREVIEW_POINTS.map((v, i) => [i * step, chartY(v)] as [number, number]);
  let line = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    line += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  const base = CHART.h - CHART.bottom;
  const area = `${line} L ${pts[pts.length - 1]![0]} ${base} L 0 ${base} Z`;
  return { line, area, points: pts };
}

const PREVIEW = previewPaths();

function PreviewChart() {
  const fillId = `${useId()}-fill`;
  const last = PREVIEW.points[PREVIEW.points.length - 1]!;
  const target = chartY(PREVIEW_TARGET);
  const base = CHART.h - CHART.bottom;
  return (
    <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} width="100%" height="auto" style={{ display: "block", overflow: "visible" }} aria-hidden>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#71977A" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#71977A" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => {
        const y = CHART.top + f * (base - CHART.top);
        return <line key={f} x1="0" x2={CHART.w} y1={y} y2={y} stroke="rgba(33,33,33,0.06)" strokeWidth="1" />;
      })}
      <line x1="0" x2={CHART.w} y1={base} y2={base} stroke="rgba(33,33,33,0.14)" strokeWidth="1" />
      <path d={PREVIEW.area} fill={`url(#${fillId})`} />
      <line x1="0" x2={CHART.w} y1={target} y2={target} stroke="#212121" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 4" />
      <text x="0" y={target - 6} textAnchor="start" fontSize="10" fontWeight="500" fill="#6B6E6A" letterSpacing="0.04em">
        TARGET
      </text>
      <path d={PREVIEW.line} fill="none" stroke={GREEN_LINE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="5.5" fill="#FFFFFF" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="#212121" />
      {PREVIEW.points.map(([x], i) => (
        <line key={i} x1={x} x2={x} y1={base} y2={base + 4} stroke="rgba(33,33,33,0.18)" strokeWidth="1" />
      ))}
    </svg>
  );
}

/**
 * Clicking the eye must not take focus (and the caret) out of the field: the MUI
 * InputAdornments demo prevents mouse down and up. The button's label changes
 * with its state (MUI's pattern), so it carries no aria-pressed: the ARIA
 * Authoring Practices say a toggle keeps one label, or drops aria-pressed.
 */
function keepFocus(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

/**
 * The BoothIQ sign-in layout on the Biofarm theme. Left, from `md` up: a soft
 * green wash with the wordmark, a plain headline and what the dashboard
 * contains. Right: the form, with the wordmark above it on small screens. The
 * form posts to the signIn Server Action (so it works before the JavaScript
 * arrives, and the action re-checks everything itself); useActionState carries
 * back the message to show and the pending state. The page the visitor wanted
 * (`next`, already checked by the page) rides along in a hidden field; the
 * action checks it again before following it. The year comes from the server
 * too, so the footer the browser hydrates is the one the server sent.
 */
export function SignInForm({ next, year }: { next: string; year: number }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  const [shown, setShown] = useState(false);
  const id = useId();
  const passwordId = `${id}-password`;
  const errorId = `${id}-error`;

  return (
    <Box component="main" sx={{ minHeight: "100vh", display: "flex", bgcolor: "background.paper", color: "text.primary" }}>
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          width: "50%",
          position: "relative",
          overflow: "hidden",
          borderRight: 1,
          borderColor: "divider",
          background: "linear-gradient(135deg, rgba(113,151,122,0.40) 0%, #F3F5F1 48%, rgba(113,151,122,0.20) 100%)",
        }}
      >
        <Box aria-hidden sx={{ position: "absolute", top: "18%", left: "20%", width: 460, height: 460, borderRadius: "50%", bgcolor: "rgba(113,151,122,0.38)", filter: "blur(140px)" }} />
        <Box aria-hidden sx={{ position: "absolute", bottom: "8%", right: "12%", width: 360, height: 360, borderRadius: "50%", bgcolor: "rgba(113,151,122,0.34)", filter: "blur(110px)" }} />
        {/* dot grid, fading out towards the edges */}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(rgba(33,33,33,0.10) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            maskImage: "radial-gradient(ellipse at 40% 45%, #000 20%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at 40% 45%, #000 20%, transparent 75%)",
          }}
        />
        <Box sx={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", p: { md: 5, lg: 6 } }}>
          <Image src="/biofarm-wordmark.png" alt="Biofarm" width={600} height={114} preload style={{ height: 28, width: "auto", alignSelf: "flex-start" }} />
          <Box sx={{ maxWidth: 480 }}>
            <Typography component="p" sx={{ fontSize: { md: "2rem", lg: "2.25rem" }, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em", mb: 2 }}>
              Marketing dashboard
              <br />
              for the Biofarm team.
            </Typography>
            <Typography component="p" sx={{ color: "text.primary", fontWeight: 400, fontSize: "1.0625rem", lineHeight: 1.6, mb: 4, opacity: 0.85 }}>
              The month&apos;s numbers from Pipedrive, the website and the ad accounts, in one place.
            </Typography>

            {/* A preview of a dashboard card: the shape of a trend tile, no figures. */}
            <Box
              sx={{
                p: 2.5,
                pb: 2,
                mb: 4,
                borderRadius: 3,
                bgcolor: "rgba(255,255,255,0.78)",
                border: "1px solid rgba(255,255,255,0.95)",
                boxShadow: "0 24px 48px -24px rgba(33,33,33,0.28), 0 1px 0 rgba(33,33,33,0.04)",
                backdropFilter: "blur(12px)",
              }}
            >
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 1.5 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
                    Qualified opportunities
                  </Typography>
                  <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.25 }}>
                    Last 12 months
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mt: 0.25 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#212121" }} />
                  <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>This month</Typography>
                </Stack>
              </Stack>
              <PreviewChart />
            </Box>

            <Stack component="ul" spacing={1.75} sx={{ listStyle: "none", m: 0, p: 0 }}>
              {CONTENTS.map((item) => (
                <Stack component="li" key={item} direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
                  <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0, mt: "2px", display: "grid", placeItems: "center" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#212121" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </Box>
                  <Typography component="span" sx={{ fontSize: "0.9375rem", lineHeight: 1.5 }}>
                    {item}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Pipedrive · Google Ads · Microsoft Ads · GA4 · Search Console
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          width: { xs: "100%", md: "50%" },
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 3,
          py: 6,
          bgcolor: "#FAFBF8",
          backgroundImage:
            "radial-gradient(640px 480px at 100% 0%, rgba(113,151,122,0.16), transparent 70%), radial-gradient(520px 420px at 0% 100%, rgba(113,151,122,0.11), transparent 70%)",
        }}
      >
        {/* the same dot texture as the left, kept to the corners so the form sits on clear ground */}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(rgba(33,33,33,0.09) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            maskImage: "radial-gradient(ellipse at 50% 50%, transparent 40%, #000 95%)",
            WebkitMaskImage: "radial-gradient(ellipse at 50% 50%, transparent 40%, #000 95%)",
            pointerEvents: "none",
          }}
        />
        <Box sx={{ position: "relative", width: "100%", maxWidth: 448 }}>
          <Box sx={{ textAlign: "center", mb: 4, display: { xs: "block", md: "none" } }}>
            <Image src="/biofarm-wordmark.png" alt="Biofarm" width={600} height={114} preload style={{ height: 28, width: "auto" }} />
          </Box>
          <Box sx={{ textAlign: { xs: "center", md: "left" }, mb: 4 }}>
            <Typography component="h1" sx={{ fontSize: "1.875rem", fontWeight: 700, letterSpacing: "-0.02em", mb: 1 }}>
              Sign in
            </Typography>
            <Typography sx={{ color: "text.secondary" }}>Enter the dashboard password to continue.</Typography>
          </Box>

          <Stack component="form" action={action} spacing={2.5} noValidate>
            <input type="hidden" name="next" value={next} />
            {state.error && (
              <Alert id={errorId} severity="error" role="alert" sx={{ borderRadius: 1.5 }}>
                {state.error}
              </Alert>
            )}
            <Box>
              <Typography component="label" htmlFor={passwordId} sx={{ display: "block", fontSize: "0.875rem", fontWeight: 500, mb: 1 }}>
                Password
              </Typography>
              <OutlinedInput
                id={passwordId}
                name="password"
                type={shown ? "text" : "password"}
                placeholder="••••••••••"
                autoComplete="current-password"
                autoFocus
                required
                fullWidth
                error={Boolean(state.error)}
                disabled={pending}
                inputProps={{ maxLength: 256, "aria-describedby": state.error ? errorId : undefined }}
                endAdornment={
                  <InputAdornment position="end">
                    <IconButton aria-label={shown ? "Hide password" : "Show password"} onClick={() => setShown((s) => !s)} onMouseDown={keepFocus} onMouseUp={keepFocus} edge="end" size="small" sx={{ color: "text.secondary" }}>
                      {shown ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </IconButton>
                  </InputAdornment>
                }
                sx={{ borderRadius: 1.5, bgcolor: "background.paper", "& input": { py: 1.75, px: 2 } }}
              />
            </Box>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              size="large"
              disabled={pending}
              sx={{ py: 1.75, borderRadius: 1.5, fontSize: "1rem", boxShadow: "0 10px 15px -3px rgba(113,151,122,0.25)", "&:hover": { bgcolor: "#6C9075", boxShadow: "0 12px 18px -4px rgba(113,151,122,0.45)" } }}
            >
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </Stack>

          <Box sx={{ mt: 6, pt: 4, borderTop: 1, borderColor: "divider", textAlign: "center" }}>
            <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
              Internal tool. Ask marketing for the password.
            </Typography>
            <Typography variant="caption" component="p" sx={{ color: "text.secondary", mt: 1 }}>
              © {year} Biofarm
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
