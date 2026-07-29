type CsvCell = string | number | null | undefined;

function escapeCsv(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Download a UTF-8 CSV (with BOM for Excel compatibility). */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: CsvCell[][],
  preamble?: string[],
): void {
  const lines: string[] = [];
  if (preamble?.length) {
    for (const line of preamble) lines.push(escapeCsv(line));
    lines.push("");
  }
  lines.push(headers.map(escapeCsv).join(","));
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(","));
  }

  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Multi-section CSV (several tables in one file). */
export function downloadCsvSections(
  filename: string,
  sections: { title: string; headers: string[]; rows: CsvCell[][] }[],
): void {
  const lines: string[] = [];
  for (const section of sections) {
    lines.push(escapeCsv(section.title));
    lines.push(section.headers.map(escapeCsv).join(","));
    for (const row of section.rows) {
      lines.push(row.map(escapeCsv).join(","));
    }
    lines.push("");
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
