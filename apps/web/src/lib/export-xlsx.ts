import * as XLSX from "xlsx";

type CellValue = string | number | Date | null | undefined;

export function downloadXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: CellValue[][],
  colWidths?: number[],
): void {
  const wb = XLSX.utils.book_new();

  // Build worksheet manually to control cell types precisely
  const ws: XLSX.WorkSheet = {};
  const numCols = headers.length;
  const numRows = rows.length + 1; // +1 for header

  // Header row
  headers.forEach((h, c) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    ws[addr] = { t: "s", v: h };
  });

  // Data rows
  rows.forEach((row, r) => {
    row.forEach((val, c) => {
      const addr = XLSX.utils.encode_cell({ r: r + 1, c });
      if (val === null || val === undefined || val === "") {
        ws[addr] = { t: "z", v: "" };
      } else if (val instanceof Date) {
        ws[addr] = { t: "n", v: XLSX.SSF.parse_date_code ? dateToSerial(val) : val.getTime(), z: "dd/mm/yyyy hh:mm" };
      } else if (typeof val === "number") {
        ws[addr] = { t: "n", v: val };
      } else {
        ws[addr] = { t: "s", v: String(val) };
      }
    });
  });

  ws["!ref"] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r: numRows - 1, c: numCols - 1 });

  if (colWidths) {
    ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function dateToSerial(date: Date): number {
  // Excel serial date: days since 1899-12-30 (with 1900 leap year bug accounted for)
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return (date.getTime() - epoch.getTime()) / 86400000;
}
