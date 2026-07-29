"use client";

import { useMemo, useState } from "react";
import { buttonVariants } from "@restai/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@restai/ui/components/popover";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useOrgSettings, useBranchSettings } from "@/hooks/use-settings";
import {
  printReportAsPdf,
  type ReportExportMeta,
} from "@/lib/report-exports";

type ExportKind = "csv" | "xlsx" | "pdf";

interface ReportExportActionsProps {
  disabled?: boolean;
  reportTitle: string;
  startDate: string;
  endDate: string;
  onCsv: (meta: ReportExportMeta) => void;
  onXlsx: (meta: ReportExportMeta) => void;
}

export function useReportExportMeta(
  reportTitle: string,
  startDate: string,
  endDate: string,
): ReportExportMeta {
  const { data: org } = useOrgSettings();
  const { data: branch } = useBranchSettings();

  return useMemo(() => {
    const orgRaw = (org ?? {}) as { name?: string };
    const branchRaw = (branch ?? {}) as { name?: string };
    return {
      orgName: orgRaw.name ?? "Empresa",
      branchName: branchRaw.name,
      reportTitle,
      startDate,
      endDate,
      issuedAt: new Date(),
    };
  }, [org, branch, reportTitle, startDate, endDate]);
}

export function ReportExportActions({
  disabled,
  reportTitle,
  startDate,
  endDate,
  onCsv,
  onXlsx,
}: ReportExportActionsProps) {
  const [open, setOpen] = useState(false);
  const meta = useReportExportMeta(reportTitle, startDate, endDate);

  const run = (kind: ExportKind) => {
    try {
      if (kind === "csv") {
        onCsv({ ...meta, issuedAt: new Date() });
        toast.success("CSV exportado");
      } else if (kind === "xlsx") {
        onXlsx({ ...meta, issuedAt: new Date() });
        toast.success("Excel exportado");
      } else {
        setOpen(false);
        toast.message("Abrindo impressão…", {
          description: 'Use "Salvar como PDF" na caixa de diálogo do navegador.',
        });
        printReportAsPdf();
        return;
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "h-9 print:hidden",
        )}
      >
        <Download className="h-4 w-4" />
        Exportar
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2 print:hidden">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Formato do relatório
        </p>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted text-left"
          onClick={() => run("pdf")}
        >
          <Printer className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium block">PDF</span>
            <span className="text-xs text-muted-foreground">Layout de impressão</span>
          </span>
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted text-left"
          onClick={() => run("xlsx")}
        >
          <FileSpreadsheet className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium block">Excel</span>
            <span className="text-xs text-muted-foreground">.xlsx multi-abas</span>
          </span>
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted text-left"
          onClick={() => run("csv")}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium block">CSV</span>
            <span className="text-xs text-muted-foreground">Planilha simples</span>
          </span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
