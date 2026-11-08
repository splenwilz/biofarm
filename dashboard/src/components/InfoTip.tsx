"use client";

import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";

import { Icon } from "@/components/shell/icons";

/**
 * A small information icon that shows the longer explanation on hover or
 * keyboard focus, so the visible caption can stay to one line. It is a real
 * button, named after what it explains, and the tooltip describes it.
 */
export function InfoTip({
  about,
  text,
}: {
  about: string;
  text: string | string[];
}) {
  const title = Array.isArray(text) ? (
    <Stack component="span" spacing={0.5} sx={{ display: "flex" }}>
      {text.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </Stack>
  ) : (
    text
  );
  return (
    <Tooltip
      title={title}
      arrow
      placement="top"
      enterTouchDelay={0}
      leaveTouchDelay={4000}
      describeChild
    >
      <IconButton
        size="small"
        aria-label={`About ${about}`}
        sx={{
          p: 0.25,
          ml: 0.25,
          color: "text.secondary",
          verticalAlign: "middle",
        }}
      >
        <Icon name="info" size={15} />
      </IconButton>
    </Tooltip>
  );
}
