"use client";

import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect } from "react";

/**
 * Error boundary for a page under the shell: the sidebar and top bar stay, the
 * page says what happened and offers a retry. The digest is shown so it can be
 * matched to the server log once there is one.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Paper role="alert" sx={{ p: 4, maxWidth: 560, mx: "auto", mt: 6 }}>
      <Stack spacing={2}>
        <Typography variant="h1" component="h1">
          This page could not load
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {error.message || "Something went wrong while building the report."}
          {error.digest && ` Reference ${error.digest}.`}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={reset}>
            Try again
          </Button>
          <Button variant="outlined" color="inherit" href="/" sx={{ borderColor: "divider" }}>
            Back to overview
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
