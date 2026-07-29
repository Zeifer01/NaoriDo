"use client";

import { useOrgSettings, useBranchSettings } from "@/hooks/use-settings";
import { resolveUploadUrl } from "@/lib/utils";

function usePrintOrg() {
  const { data: org } = useOrgSettings();
  const { data: branch } = useBranchSettings();
  const orgRaw = (org ?? {}) as { name?: string; logo_url?: string | null };
  const branchRaw = (branch ?? {}) as { name?: string };
  return {
    orgName: orgRaw.name ?? "Empresa",
    branchName: branchRaw.name,
    logoUrl: resolveUploadUrl(orgRaw.logo_url),
  };
}

/** Print-only header: logo, company, period, issued date. */
export function ReportPrintHeader({
  title,
  startDate,
  endDate,
}: {
  title: string;
  startDate: string;
  endDate: string;
}) {
  const { orgName, branchName, logoUrl } = usePrintOrg();
  const issued = new Date().toLocaleString("pt-BR");

  return (
    <header className="hidden print:block report-print-header mb-6 border-b border-black/20 pb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-12 w-12 object-contain" />
          ) : (
            <div className="h-12 w-12 rounded border border-black/20 flex items-center justify-center text-xs font-bold">
              {orgName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight truncate">{orgName}</p>
            {branchName && <p className="text-sm text-black/70">{branchName}</p>}
          </div>
        </div>
        <div className="text-right text-xs text-black/70 shrink-0">
          <p className="font-semibold text-sm text-black">{title}</p>
          <p>
            Período: {startDate} a {endDate}
          </p>
          <p>Emitido em: {issued}</p>
        </div>
      </div>
    </header>
  );
}

export function ReportPrintFooter({ title }: { title: string }) {
  const { orgName } = usePrintOrg();
  return (
    <footer className="hidden print:block report-print-footer mt-8 pt-3 border-t border-black/20 text-[10px] text-black/60">
      <div className="flex justify-between gap-4">
        <span>
          {orgName} — {title}
        </span>
        <span>Gerado pelo sistema de gestão · Confidencial</span>
      </div>
    </footer>
  );
}

export function ReportPrintTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="hidden print:block mb-4">
      <h1 className="text-xl font-bold">{title}</h1>
      {subtitle && <p className="text-sm text-black/70 mt-0.5">{subtitle}</p>}
    </div>
  );
}

/** @deprecated use ReportPrintHeader + ReportPrintFooter */
export function ReportPrintChrome(props: {
  title: string;
  startDate: string;
  endDate: string;
}) {
  return <ReportPrintHeader {...props} />;
}
