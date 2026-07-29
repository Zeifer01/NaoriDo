import type {
  AnalyticsMetric,
  CustomerAnalytics,
  ExecutiveHubAnalytics,
  FinanceAnalytics,
  ProductAnalytics,
} from "@restai/types";
import { downloadCsvSections } from "./export-csv";
import { downloadXlsxWorkbook, type XlsxSheet } from "./export-xlsx";

export interface ReportExportMeta {
  orgName: string;
  branchName?: string;
  reportTitle: string;
  startDate: string;
  endDate: string;
  issuedAt?: Date;
}

function centsToNumber(cents: number): number {
  return Math.round(cents) / 100;
}

function metricRows(metrics: AnalyticsMetric[]): (string | number)[][] {
  return metrics.map((m) => {
    let value: string | number = m.value;
    if (m.unit === "cents") value = centsToNumber(m.value as number);
    const change =
      m.changeRatio === null || m.changeRatio === undefined
        ? ""
        : `${(m.changeRatio * 100).toFixed(1)}%`;
    return [m.label, value, m.unit, change];
  });
}

function metaPreamble(meta: ReportExportMeta): string[] {
  const issued = (meta.issuedAt ?? new Date()).toLocaleString("pt-BR");
  return [
    meta.orgName,
    meta.branchName ? `Filial: ${meta.branchName}` : "",
    `${meta.reportTitle}`,
    `Período: ${meta.startDate} a ${meta.endDate}`,
    `Emitido em: ${issued}`,
  ].filter(Boolean);
}

function fileBase(meta: ReportExportMeta, slug: string): string {
  return `${slug}-${meta.startDate}_${meta.endDate}`;
}

function metaSheet(meta: ReportExportMeta): XlsxSheet {
  return {
    name: "Capa",
    headers: ["Campo", "Valor"],
    rows: [
      ["Empresa", meta.orgName],
      ["Filial", meta.branchName ?? ""],
      ["Relatório", meta.reportTitle],
      ["Período início", meta.startDate],
      ["Período fim", meta.endDate],
      ["Emitido em", (meta.issuedAt ?? new Date()).toLocaleString("pt-BR")],
    ],
    colWidths: [20, 40],
  };
}

const METRIC_HEADERS = ["Indicador", "Valor", "Unidade", "Variação"];

export function exportHubCsv(data: ExecutiveHubAnalytics, meta: ReportExportMeta) {
  downloadCsvSections(fileBase(meta, "hub-executivo"), [
    {
      title: metaPreamble(meta).join(" | "),
      headers: METRIC_HEADERS,
      rows: metricRows(data.metrics),
    },
    {
      title: "Série diária",
      headers: ["Data", "Pedidos", "Receita"],
      rows: data.series.map((d) => [d.date, d.orders, centsToNumber(d.revenueCents)]),
    },
    {
      title: "Top produtos",
      headers: ["Produto", "Qtd", "Receita", "Share %"],
      rows: data.topProducts.map((p) => [
        p.name,
        p.quantity,
        centsToNumber(p.revenueCents),
        Number((p.revenueShare * 100).toFixed(2)),
      ]),
    },
    {
      title: "Insights",
      headers: ["Severidade", "Título", "Mensagem"],
      rows: data.insights.map((i) => [i.severity, i.title, i.message]),
    },
  ]);
}

export function exportHubXlsx(data: ExecutiveHubAnalytics, meta: ReportExportMeta) {
  downloadXlsxWorkbook(fileBase(meta, "hub-executivo"), [
    metaSheet(meta),
    {
      name: "Indicadores",
      headers: METRIC_HEADERS,
      rows: metricRows(data.metrics),
      colWidths: [28, 14, 12, 12],
    },
    {
      name: "Série diária",
      headers: ["Data", "Pedidos", "Receita"],
      rows: data.series.map((d) => [d.date, d.orders, centsToNumber(d.revenueCents)]),
      colWidths: [14, 10, 14],
    },
    {
      name: "Top produtos",
      headers: ["Produto", "Qtd", "Receita", "Share %"],
      rows: data.topProducts.map((p) => [
        p.name,
        p.quantity,
        centsToNumber(p.revenueCents),
        Number((p.revenueShare * 100).toFixed(2)),
      ]),
      colWidths: [32, 8, 14, 10],
    },
    {
      name: "Insights",
      headers: ["Severidade", "Título", "Mensagem"],
      rows: data.insights.map((i) => [i.severity, i.title, i.message]),
      colWidths: [12, 28, 60],
    },
  ]);
}

export function exportCustomersCsv(data: CustomerAnalytics, meta: ReportExportMeta) {
  downloadCsvSections(fileBase(meta, "crm-clientes"), [
    {
      title: metaPreamble(meta).join(" | "),
      headers: METRIC_HEADERS,
      rows: metricRows(data.metrics),
    },
    {
      title: "Ranking",
      headers: [
        "Cliente",
        "Pedidos",
        "LTV",
        "Ticket médio",
        "Última compra (dias)",
        "RFM",
        "ABC",
        "VIP",
        "Em risco",
        "Cidade",
        "Bairro",
      ],
      rows: data.ranking.map((r) => [
        r.name,
        r.orderCount,
        centsToNumber(r.totalSpentCents),
        centsToNumber(r.avgTicketCents),
        r.daysSinceLastOrder ?? "",
        r.rfm.segment,
        r.abc,
        r.isVip ? "Sim" : "Não",
        r.isAtRisk ? "Sim" : "Não",
        r.city ?? "",
        r.neighborhood ?? "",
      ]),
    },
    {
      title: "Segmentos RFM",
      headers: ["Segmento", "Clientes", "Receita"],
      rows: data.segments.map((s) => [s.segment, s.count, centsToNumber(s.revenueCents)]),
    },
    {
      title: "Curva ABC",
      headers: ["Classe", "Clientes", "Receita", "Share %"],
      rows: data.abc.map((a) => [
        a.class,
        a.count,
        centsToNumber(a.revenueCents),
        Number((a.share * 100).toFixed(2)),
      ]),
    },
    {
      title: "Insights",
      headers: ["Severidade", "Título", "Mensagem"],
      rows: data.insights.map((i) => [i.severity, i.title, i.message]),
    },
  ]);
}

export function exportCustomersXlsx(data: CustomerAnalytics, meta: ReportExportMeta) {
  downloadXlsxWorkbook(fileBase(meta, "crm-clientes"), [
    metaSheet(meta),
    {
      name: "Indicadores",
      headers: METRIC_HEADERS,
      rows: metricRows(data.metrics),
      colWidths: [32, 14, 12, 12],
    },
    {
      name: "Ranking",
      headers: [
        "Cliente",
        "Pedidos",
        "LTV",
        "Ticket médio",
        "Dias sem compra",
        "RFM",
        "ABC",
        "VIP",
        "Em risco",
        "Cidade",
        "Bairro",
        "Telefone",
        "E-mail",
      ],
      rows: data.ranking.map((r) => [
        r.name,
        r.orderCount,
        centsToNumber(r.totalSpentCents),
        centsToNumber(r.avgTicketCents),
        r.daysSinceLastOrder ?? "",
        r.rfm.segment,
        r.abc,
        r.isVip ? "Sim" : "Não",
        r.isAtRisk ? "Sim" : "Não",
        r.city ?? "",
        r.neighborhood ?? "",
        r.phone ?? "",
        r.email ?? "",
      ]),
      colWidths: [24, 8, 12, 12, 12, 12, 6, 6, 8, 14, 14, 14, 22],
    },
    {
      name: "RFM",
      headers: ["Segmento", "Clientes", "Receita"],
      rows: data.segments.map((s) => [s.segment, s.count, centsToNumber(s.revenueCents)]),
    },
    {
      name: "ABC",
      headers: ["Classe", "Clientes", "Receita", "Share %"],
      rows: data.abc.map((a) => [
        a.class,
        a.count,
        centsToNumber(a.revenueCents),
        Number((a.share * 100).toFixed(2)),
      ]),
    },
    {
      name: "Insights",
      headers: ["Severidade", "Título", "Mensagem"],
      rows: data.insights.map((i) => [i.severity, i.title, i.message]),
      colWidths: [12, 28, 60],
    },
  ]);
}

export function exportFinanceCsv(data: FinanceAnalytics, meta: ReportExportMeta) {
  downloadCsvSections(fileBase(meta, "financeiro"), [
    {
      title: metaPreamble(meta).join(" | "),
      headers: METRIC_HEADERS,
      rows: metricRows(data.metrics),
    },
    {
      title: "Série diária",
      headers: ["Data", "Pedidos", "Receita"],
      rows: data.series.map((d) => [d.date, d.orders, centsToNumber(d.revenueCents)]),
    },
    {
      title: "Pagamentos",
      headers: ["Método", "Valor", "Share %", "Gorjeta"],
      rows: data.paymentMethods.map((p) => [
        p.method,
        centsToNumber(p.amountCents),
        Number((p.share * 100).toFixed(2)),
        centsToNumber(p.tipCents),
      ]),
    },
    {
      title: "Por dia da semana",
      headers: ["Dia", "Pedidos", "Receita"],
      rows: data.byWeekday.map((d) => [d.label, d.orders, centsToNumber(d.revenueCents)]),
    },
    {
      title: "Por horário",
      headers: ["Hora", "Pedidos", "Receita"],
      rows: data.byHour.map((d) => [d.hour, d.orders, centsToNumber(d.revenueCents)]),
    },
  ]);
}

export function exportFinanceXlsx(data: FinanceAnalytics, meta: ReportExportMeta) {
  downloadXlsxWorkbook(fileBase(meta, "financeiro"), [
    metaSheet(meta),
    {
      name: "Indicadores",
      headers: METRIC_HEADERS,
      rows: metricRows(data.metrics),
      colWidths: [28, 14, 12, 12],
    },
    {
      name: "Série diária",
      headers: ["Data", "Pedidos", "Receita"],
      rows: data.series.map((d) => [d.date, d.orders, centsToNumber(d.revenueCents)]),
    },
    {
      name: "Pagamentos",
      headers: ["Método", "Valor", "Share %", "Gorjeta"],
      rows: data.paymentMethods.map((p) => [
        p.method,
        centsToNumber(p.amountCents),
        Number((p.share * 100).toFixed(2)),
        centsToNumber(p.tipCents),
      ]),
    },
    {
      name: "Dia da semana",
      headers: ["Dia", "Pedidos", "Receita"],
      rows: data.byWeekday.map((d) => [d.label, d.orders, centsToNumber(d.revenueCents)]),
    },
    {
      name: "Horário",
      headers: ["Hora", "Pedidos", "Receita"],
      rows: data.byHour.map((d) => [d.hour, d.orders, centsToNumber(d.revenueCents)]),
    },
  ]);
}

export function exportProductsCsv(data: ProductAnalytics, meta: ReportExportMeta) {
  downloadCsvSections(fileBase(meta, "produtos"), [
    {
      title: metaPreamble(meta).join(" | "),
      headers: METRIC_HEADERS,
      rows: metricRows(data.metrics),
    },
    {
      title: "Top por receita",
      headers: ["Produto", "Categoria", "Qtd", "Receita", "Share %", "Margem %"],
      rows: data.topByRevenue.map((p) => [
        p.name,
        p.categoryName ?? "",
        p.quantity,
        centsToNumber(p.revenueCents),
        Number((p.revenueShare * 100).toFixed(2)),
        p.marginRatio !== null ? Number((p.marginRatio * 100).toFixed(2)) : "",
      ]),
    },
    {
      title: "Por categoria",
      headers: ["Categoria", "Qtd", "Receita", "Share %"],
      rows: data.byCategory.map((c) => [
        c.categoryName,
        c.quantity,
        centsToNumber(c.revenueCents),
        Number((c.share * 100).toFixed(2)),
      ]),
    },
    {
      title: "Sem venda",
      headers: ["Produto", "Categoria"],
      rows: data.withoutSales.map((p) => [p.name, p.categoryName ?? ""]),
    },
  ]);
}

export function exportProductsXlsx(data: ProductAnalytics, meta: ReportExportMeta) {
  downloadXlsxWorkbook(fileBase(meta, "produtos"), [
    metaSheet(meta),
    {
      name: "Indicadores",
      headers: METRIC_HEADERS,
      rows: metricRows(data.metrics),
    },
    {
      name: "Top receita",
      headers: ["Produto", "Categoria", "Qtd", "Receita", "Share %", "Custo", "Margem", "Margem %"],
      rows: data.topByRevenue.map((p) => [
        p.name,
        p.categoryName ?? "",
        p.quantity,
        centsToNumber(p.revenueCents),
        Number((p.revenueShare * 100).toFixed(2)),
        p.costCents !== null ? centsToNumber(p.costCents) : "",
        p.marginCents !== null ? centsToNumber(p.marginCents) : "",
        p.marginRatio !== null ? Number((p.marginRatio * 100).toFixed(2)) : "",
      ]),
      colWidths: [28, 16, 8, 12, 10, 10, 10, 10],
    },
    {
      name: "Categorias",
      headers: ["Categoria", "Qtd", "Receita", "Share %"],
      rows: data.byCategory.map((c) => [
        c.categoryName,
        c.quantity,
        centsToNumber(c.revenueCents),
        Number((c.share * 100).toFixed(2)),
      ]),
    },
    {
      name: "Sem venda",
      headers: ["Produto", "Categoria"],
      rows: data.withoutSales.map((p) => [p.name, p.categoryName ?? ""]),
    },
  ]);
}

/** Trigger browser print dialog — user can "Save as PDF". */
export function printReportAsPdf(): void {
  if (typeof window === "undefined") return;
  // Allow React to paint print-only chrome before the dialog opens.
  requestAnimationFrame(() => {
    setTimeout(() => window.print(), 50);
  });
}
