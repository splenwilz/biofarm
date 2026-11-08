import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";

/** Shape of a page while its data loads: header, three tiles, one chart card. */
export default function Loading() {
  return (
    <Stack spacing={3} role="status" aria-label="Loading">
      <Box>
        <Skeleton variant="text" width={180} height={36} />
        <Skeleton variant="text" width={420} />
      </Box>
      <Grid container spacing={2}>
        {[0, 1, 2].map((i) => (
          <Grid key={i} size={{ xs: 12, md: 4 }}>
            <Paper sx={{ p: 2.5 }}>
              <Skeleton variant="text" width={160} />
              <Skeleton variant="text" width={90} height={44} />
              <Skeleton variant="text" width={120} />
              <Skeleton variant="text" width="80%" />
            </Paper>
          </Grid>
        ))}
      </Grid>
      <Paper sx={{ p: 2.5 }}>
        <Skeleton variant="text" width={240} />
        <Skeleton variant="rectangular" height={260} sx={{ mt: 2, borderRadius: 1 }} />
      </Paper>
    </Stack>
  );
}
