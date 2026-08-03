"use client";

import { useMemo, useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Label } from "@restai/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@restai/ui/components/dialog";
import { useImportCustomers } from "@/hooks/use-loyalty";
import { toast } from "sonner";
import { Upload } from "lucide-react";

type ParsedRow = {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
};

const NAME_HEADERS = ["name", "nome", "nombre", "cliente", "contact", "contato", "contacto"];
const PHONE_HEADERS = [
  "phone",
  "telefone",
  "telefono",
  "tel",
  "celular",
  "mobile",
  "whatsapp",
  "número",
  "numero",
  "number",
];
const EMAIL_HEADERS = ["email", "e-mail", "correo", "mail"];
const ADDRESS_HEADERS = ["address", "endereco", "endereço", "direccion", "dirección", "dir"];
const NOTES_HEADERS = ["notes", "note", "obs", "observacao", "observação", "notas"];

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function findCol(headers: string[], candidates: string[]): number {
  const normalized = headers.map(normalizeHeader);
  const cand = candidates.map(normalizeHeader);
  for (let i = 0; i < normalized.length; i++) {
    if (cand.some((c) => normalized[i] === c || normalized[i].includes(c))) {
      return i;
    }
  }
  return -1;
}

/** Minimal CSV parser supporting quoted fields and ; or , separators. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === "," || ch === ";") {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (ch === "\n" || (ch === "\r" && next === "\n")) {
      row.push(cell.trim());
      cell = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      if (ch === "\r") i++;
      continue;
    }

    if (ch === "\r") {
      row.push(cell.trim());
      cell = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    cell += ch;
  }

  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function mapRows(raw: string[][]): { rows: ParsedRow[]; warnings: string[] } {
  const warnings: string[] = [];
  if (raw.length === 0) return { rows: [], warnings: ["Arquivo vazio"] };

  const headers = raw[0];
  let dataStart = 1;
  let nameIdx = findCol(headers, NAME_HEADERS);
  let phoneIdx = findCol(headers, PHONE_HEADERS);
  let emailIdx = findCol(headers, EMAIL_HEADERS);
  let addressIdx = findCol(headers, ADDRESS_HEADERS);
  let notesIdx = findCol(headers, NOTES_HEADERS);

  // No header row — assume name, phone [, address]
  if (nameIdx < 0 || phoneIdx < 0) {
    const firstLooksLikeHeader =
      NAME_HEADERS.some((h) => normalizeHeader(headers[0] || "").includes(normalizeHeader(h))) ||
      PHONE_HEADERS.some((h) => normalizeHeader(headers[0] || "").includes(normalizeHeader(h)));

    if (!firstLooksLikeHeader && headers.length >= 2) {
      nameIdx = 0;
      phoneIdx = 1;
      addressIdx = headers.length >= 3 ? 2 : -1;
      dataStart = 0;
      warnings.push("Cabeçalho não detectado — usando coluna 1 = nome, coluna 2 = telefone");
    } else {
      return {
        rows: [],
        warnings: [
          "Não foi possível detectar colunas de nome e telefone. Use cabeçalhos como Nome, Telefone.",
        ],
      };
    }
  }

  const rows: ParsedRow[] = [];
  for (let i = dataStart; i < raw.length; i++) {
    const line = raw[i];
    const name = (line[nameIdx] || "").trim();
    const phone = (line[phoneIdx] || "").trim();
    if (!name && !phone) continue;
    rows.push({
      name: name || "Sem nome",
      phone,
      email: emailIdx >= 0 ? (line[emailIdx] || "").trim() || undefined : undefined,
      address: addressIdx >= 0 ? (line[addressIdx] || "").trim() || undefined : undefined,
      notes: notesIdx >= 0 ? (line[notesIdx] || "").trim() || undefined : undefined,
    });
  }

  return { rows, warnings };
}

export function ImportCustomersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const importCustomers = useImportCustomers();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const preview = useMemo(() => parsed.slice(0, 5), [parsed]);

  function reset() {
    setFileName(null);
    setParsed([]);
    setWarnings([]);
    setParseError(null);
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    setParseError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const { rows, warnings: w } = mapRows(parseCsv(text));
      setWarnings(w);
      setParsed(rows);
      if (rows.length === 0) {
        setParseError(w[0] || "Nenhuma linha válida encontrada");
      }
    } catch {
      setParseError("Não foi possível ler o arquivo");
      setParsed([]);
    }
  }

  function handleSubmit() {
    if (parsed.length === 0) return;
    importCustomers.mutate(
      { rows: parsed },
      {
        onSuccess: (data: any) => {
          toast.success(
            `Importação concluída: ${data.created} criados, ${data.skipped} já existiam` +
              (data.errorCount ? `, ${data.errorCount} com erro` : ""),
          );
          if (data.errors?.length) {
            toast.message(
              `Primeiros erros: ${data.errors
                .slice(0, 3)
                .map((e: any) => `L${e.row}: ${e.reason}`)
                .join(" · ")}`,
            );
          }
          reset();
          onOpenChange(false);
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar clientes (CSV)</DialogTitle>
          <DialogDescription>
            Colunas mínimas: <strong>Nome</strong> e <strong>Telefone</strong>. Endereço e e-mail
            são opcionais. Clientes com o mesmo telefone são ignorados (não sobrescreve).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customers-csv">Arquivo CSV</Label>
            <input
              id="customers-csv"
              type="file"
              accept=".csv,text/csv,.txt"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
            />
            {fileName && (
              <p className="text-xs text-muted-foreground">
                {fileName} · {parsed.length} linhas prontas
              </p>
            )}
          </div>

          {warnings.map((w) => (
            <p key={w} className="text-xs text-amber-700 dark:text-amber-400">
              {w}
            </p>
          ))}
          {parseError && <p className="text-sm text-destructive">{parseError}</p>}

          {preview.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left p-2 font-medium">Nome</th>
                    <th className="text-left p-2 font-medium">Telefone</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={`${r.phone}-${i}`} className="border-b border-border last:border-0">
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{r.phone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 5 && (
                <p className="p-2 text-xs text-muted-foreground">
                  … e mais {parsed.length - 5} linhas
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={parsed.length === 0 || importCustomers.isPending}
            onClick={handleSubmit}
          >
            <Upload className="h-4 w-4 mr-2" />
            {importCustomers.isPending
              ? "Importando..."
              : `Importar ${parsed.length || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
