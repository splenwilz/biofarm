import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { InfoTip } from "@/components/InfoTip";

export function PageHeader({ title, subtitle, actions, info }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; info?: string }) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 2, mb: 3 }}>
      <Box>
        <Typography variant="h1" component="h1">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
            {info && <InfoTip about={title} text={info} />}
          </Typography>
        )}
      </Box>
      {actions}
    </Stack>
  );
}
