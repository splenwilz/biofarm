import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { InfoTip } from "@/components/InfoTip";

export interface SectionProps {
  title: string;
  subtitle?: React.ReactNode;
  /** Right-hand slot of the header bar: a control or a "View all" link. */
  action?: React.ReactNode;
  /** Tables bring their own cell padding; pass false to let them sit flush. */
  padded?: boolean;
  children: React.ReactNode;
  id?: string;
  /** In a grid row, fill the row's height so neighbouring cards line up. */
  fullHeight?: boolean;
  /** The longer explanation, behind an info icon beside the title. */
  info?: string;
}

/** A card with a header bar, the BoothIQ section treatment. */
export function Section({ title, subtitle, action, padded = true, children, id, fullHeight = false, info }: SectionProps) {
  return (
    <Paper component="section" aria-labelledby={id} sx={{ overflow: "hidden", ...(fullHeight ? { height: "100%", display: "flex", flexDirection: "column" } : {}) }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 2, px: 2.5, py: 1.75, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h2" component="h2" id={id} sx={{ display: "inline" }}>
            {title}
          </Typography>
          {info && <InfoTip about={title} text={info} />}
          {subtitle && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Stack>
      <Box sx={{ p: padded ? 2.5 : 1, ...(fullHeight ? { flex: 1 } : {}) }}>{children}</Box>
    </Paper>
  );
}
