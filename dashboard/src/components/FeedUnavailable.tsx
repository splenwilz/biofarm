"use client";

import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * Shown instead of the shell when the lead API did not give the dashboard its
 * records: refused the token, has no import yet, is behind on a migration, or
 * did not answer. The layout renders this on the server with the API's own
 * explanation, which names no secret; a thrown error would reach the error
 * boundary as a generic message in production (Next replaces the message of
 * an error thrown in a Server Component with a digest).
 */
export function FeedUnavailable({ message }: { message: string }) {
  return (
    <Paper role="alert" sx={{ p: 4, maxWidth: 560, mx: "auto", mt: 6 }}>
      <Stack spacing={2}>
        <Typography variant="h1" component="h1">
          The dashboard feed is unavailable
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Nothing is lost: the numbers come back as soon as the lead API answers again. If this stays for more than a few minutes, the message above says what the API needs.
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
