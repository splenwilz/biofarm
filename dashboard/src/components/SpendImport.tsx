"use client";

import Button from "@mui/material/Button";
import { useRef } from "react";

import { Icon } from "@/components/shell/icons";
import { parseSpendCsv } from "@/lib/csv";
import type { SpendEntry } from "@/lib/types";

export interface ImportResult {
  added: number;
  errors: string[];
}

export interface SpendImportProps {
  months: string[];
  onImport: (entries: Omit<SpendEntry, "id">[]) => void;
  onResult: (result: ImportResult) => void;
}

/** The "Import CSV" button: parses the agency's file, passes the good lines up and reports what was skipped. */
export function SpendImport({ months, onImport, onResult }: SpendImportProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = parseSpendCsv(await file.text(), months);
    if (result.entries.length) onImport(result.entries);
    onResult({ added: result.entries.length, errors: result.errors });
  }

  return (
    <>
      <Button variant="outlined" color="inherit" onClick={() => fileInput.current?.click()} startIcon={<Icon name="upload" size={16} />} data-print="hide" sx={{ height: 40, borderColor: "divider", fontWeight: 500, whiteSpace: "nowrap" }}>
        Import CSV
      </Button>
      <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={importFile} aria-label="Spend CSV file" style={{ display: "none" }} />
    </>
  );
}
