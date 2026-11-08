"use client";

import Button from "@mui/material/Button";

import { Icon } from "@/components/shell/icons";
import { downloadCsv, type CsvValue } from "@/lib/csv";

export interface ExportButtonProps {
  /** File name without extension; the report month is usually in it. */
  filename: string;
  /** Rows to write; computed lazily so the page does not pay for it on render. */
  rows: () => Record<string, CsvValue>[];
}

/** Downloads what the page is showing as CSV. Hidden when printing. */
export function ExportButton({ filename, rows }: ExportButtonProps) {
  return (
    <Button data-print="hide" variant="outlined" color="inherit" size="small" onClick={() => downloadCsv(filename, rows())} startIcon={<Icon name="download" size={16} />} sx={{ borderColor: "divider", fontWeight: 500 }}>
      Export CSV
    </Button>
  );
}
