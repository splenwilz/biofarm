"use client";

import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";

export default function NotFound() {
  return (
    <Paper sx={{ p: 4, maxWidth: 560, mx: "auto", mt: 6 }}>
      <Stack spacing={2}>
        <Typography variant="h1" component="h1">
          No such page
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The pages are listed in the sidebar.
        </Typography>
        <div>
          <Button component={NextLink} href="/" variant="contained">
            Back to overview
          </Button>
        </div>
      </Stack>
    </Paper>
  );
}
