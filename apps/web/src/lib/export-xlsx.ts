import * as XLSX from "xlsx";

type CellValue = string | number | Date | null | undefined;

export interface XlsxSheet {
  name: string;
  headers: string[];
  rows: CellValue[][];
  colWidths?: number[];
}

function buildWorksheet(
  headers: string[],
  rows: CellValue[][],
  colWidths?: number[],
): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const numCols = Math.max(headers.length, 1);
  const numRows = rows.length + 1;

  headers.forEach((h, c) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    ws[addr] = { t: "s", v: h };
  });

  rows.forEach((row, r) => {
    row.forEach((val, c) => {
      const addr = XLSX.utils.encode_cell({ r: r + 1, c });
      if (val === null || val === undefined || val === "") {
        ws[addr] = { t: "z", v: "" };
      } else if (val instanceof Date) {
        ws[addr] = {
          t: "n",
          v: dateToSerial(val),
          z: "dd/mm/yyyy hh:mm",
        };
      } else if (typeof val === "number") {
        ws[addr] = { t: "n", v: val };
      } else {
        ws[addr] = { t: "s", v: String(val) };
      }
    });
  });

  ws["!ref"] = XLSX.utils.encode_range(
    { r: 0, c: 0 },
    { r: Math.max(numRows - 1, 0), c: numCols - 1 },
  );

  if (colWidths) {
    ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  }

  return ws;
}

export function downloadXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: CellValue[][],
  colWidths?: number[],
): void {
  downloadXlsxWorkbook(filename, [{ name: sheetName, headers, rows, colWidths }]);
}

/** Multi-sheet workbook download. */
export function downloadXlsxWorkbook(filename: string, sheets: XlsxSheet[]): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const safeName = sheet.name.slice(0, 31) || "Sheet1";
    const ws = buildWorksheet(sheet.headers, sheet.rows, sheet.colWidths);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }
  const name = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, name);
}

function dateToSerial(date: Date): number {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return (date.getTime() - epoch.getTime()) / 86400000;
}
