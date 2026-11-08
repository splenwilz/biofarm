"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";

import { PageHeader } from "@/components/PageHeader";
import { useAlerts } from "@/components/pages/useAlerts";
import { useReport } from "@/components/pages/useReport";
import { Icon } from "@/components/shell/icons";
import { dateLabel, monthLabel } from "@/lib/format";
import { ALERT_RULES, type Alert, type AlertGroup, type AlertSeverity } from "@/lib/insights";

const SEVERITY: Record<AlertSeverity, { label: string; color: "error" | "warning" | "default" }> = {
  critical: { label: "Critical", color: "error" },
  warning: { label: "Warning", color: "warning" },
  info: { label: "Worth knowing", color: "default" },
};

const GROUPS: { key: AlertGroup; title: string; empty: string }[] = [
  { key: "data", title: "Data", empty: "The feed is fresh, spend is entered and the records are clean enough." },
  { key: "performance", title: "Performance", empty: "The month is within reach of target and paid spend is producing." },
];

function AlertGroupList({ group, alerts, linkTo }: { group: (typeof GROUPS)[number]; alerts: Alert[]; linkTo: (href: string) => string }) {
  const rules = ALERT_RULES.filter((r) => r.group === group.key);
  return (
    <Stack spacing={1.5}>
      <Typography variant="h2" component="h2">
        {group.title}
      </Typography>
      {alerts.length === 0 ? (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="body2" color="text.secondary">
            {group.empty}
          </Typography>
        </Paper>
      ) : (
        <Stack component="ul" spacing={1.5} sx={{ listStyle: "none", m: 0, p: 0 }} aria-label={`${group.title} alerts`}>
          {alerts.map((a) => (
            <Paper component="li" key={a.id} sx={{ p: 2.5 }}>
              <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
                <Box sx={{ pt: 0.25 }}>
                  <Chip size="small" label={SEVERITY[a.severity].label} color={SEVERITY[a.severity].color} variant={a.severity === "info" ? "outlined" : "filled"} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
                    {a.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {a.detail}
                  </Typography>
                </Box>
                <Link component={NextLink} href={linkTo(a.href)} underline="hover" variant="body2" sx={{ fontWeight: 600, color: "text.primary", display: "inline-flex", alignItems: "center", gap: 0.5, whiteSpace: "nowrap", pt: 0.25 }}>
                  Go there
                  <Icon name="arrowRight" size={14} />
                </Link>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary">
        Rules: {rules.map((r) => `${r.title.toLowerCase()}${r.enabled ? "" : ` (${r.note?.toLowerCase() ?? "off"})`}`).join("; ")}.
      </Typography>
    </Stack>
  );
}

export function AlertsPage() {
  const { alerts, now } = useAlerts();
  const { report, linkTo, data } = useReport();
  return (
    <Stack spacing={4}>
      <PageHeader title="Alerts" subtitle={`What needs attention for ${monthLabel(report.reportMonth)} · checked against data received ${dateLabel(data.syncedAt)}, as of ${dateLabel(now)}`} />
      {GROUPS.map((g) => (
        <AlertGroupList key={g.key} group={g} alerts={alerts.filter((a) => a.group === g.key)} linkTo={linkTo} />
      ))}
    </Stack>
  );
}
