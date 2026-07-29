import type {
  AnalyticsInsight,
  AnalyticsMetric,
  CustomerAnalyticsRow,
  ProductAnalyticsRow,
  TimeSeriesPoint,
} from "@restai/types";
import { formatRatioPercent } from "./period.js";

function findMetric(metrics: AnalyticsMetric[], id: string): AnalyticsMetric | undefined {
  return metrics.find((m) => m.id === id);
}

function moneyLabel(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function buildCustomerInsights(input: {
  metrics: AnalyticsMetric[];
  atRiskCount: number;
  lostCount: number;
  lostDays: number;
  newInPeriod: number;
  prevNew: number;
  retentionRate: number;
  vipIdle: CustomerAnalyticsRow[];
}): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  const { metrics, atRiskCount, lostCount, lostDays, newInPeriod, prevNew, vipIdle } =
    input;

  const newMetric = findMetric(metrics, "crm.customers_new");
  if (newMetric?.changeRatio !== null && newMetric?.changeRatio !== undefined && prevNew > 0) {
    const severity =
      newMetric.changeRatio < -0.1
        ? "warning"
        : newMetric.changeRatio > 0.1
          ? "positive"
          : "info";
    insights.push({
      id: "crm.new_customers_delta",
      category: "customers",
      severity,
      title: "Entrada de novos clientes",
      message: `Novos clientes no período: ${newInPeriod} vs ${prevNew} no período anterior (${formatRatioPercent(newMetric.changeRatio)}).`,
      metricIds: ["crm.customers_new"],
      data: { current: newInPeriod, previous: prevNew, changeRatio: newMetric.changeRatio },
    });
  }

  if (atRiskCount > 0) {
    insights.push({
      id: "crm.at_risk",
      category: "retention",
      severity: atRiskCount >= 20 ? "critical" : "warning",
      title: "Clientes em risco",
      message: `${atRiskCount} cliente${atRiskCount === 1 ? "" : "s"} está${atRiskCount === 1 ? "" : "ão"} há mais de 60 dias sem pedir — candidatos a campanha de recuperação.`,
      metricIds: ["crm.customers_at_risk"],
      data: { count: atRiskCount },
    });
  }

  if (lostCount > 0) {
    insights.push({
      id: "crm.lost",
      category: "retention",
      severity: "warning",
      title: "Base inativa",
      message: `${lostCount} cliente${lostCount === 1 ? "" : "s"} sem pedidos há mais de ${lostDays} dias (churn estimado).`,
      metricIds: ["crm.customers_lost", "crm.churn_estimate"],
      data: { count: lostCount, lostDays },
    });
  }

  const retention = findMetric(metrics, "crm.retention_rate");
  if (retention && typeof retention.value === "number") {
    insights.push({
      id: "crm.retention",
      category: "retention",
      severity: retention.value < 40 ? "warning" : "info",
      title: "Retenção no período",
      message: `Taxa de retenção aproximada: ${retention.value}%. ${
        retention.value < 40
          ? "Reforce recompra (cupom, WhatsApp, fidelidade)."
          : "Base recorrente saudável — mantenha o ritmo de relacionamento."
      }`,
      metricIds: ["crm.retention_rate"],
    });
  }

  if (vipIdle.length > 0) {
    const sample = vipIdle.slice(0, 3).map((v) => v.name).join(", ");
    insights.push({
      id: "crm.vip_idle",
      category: "customers",
      severity: "critical",
      title: "VIP sem comprar",
      message: `${vipIdle.length} cliente(s) VIP parado(s). Exemplos: ${sample}. Priorize contato pessoal.`,
      metricIds: ["crm.customers_vip"],
      data: { count: vipIdle.length, sampleIds: vipIdle.slice(0, 5).map((v) => v.customerId) },
    });
  }

  const ltv = findMetric(metrics, "crm.portfolio_ltv");
  if (ltv && ltv.value > 0) {
    insights.push({
      id: "crm.portfolio_value",
      category: "customers",
      severity: "positive",
      title: "Valor da carteira",
      message: `Sua base já gerou ${moneyLabel(ltv.value as number)} em vendas históricas (LTV total). Esse é um ativo do negócio.`,
      metricIds: ["crm.portfolio_ltv", "crm.avg_ltv"],
    });
  }

  return insights;
}

export function buildExecutiveInsights(input: {
  metrics: AnalyticsMetric[];
  series: TimeSeriesPoint[];
  topProducts: ProductAnalyticsRow[];
  peakWeekday: string | null;
  peakHour: number | null;
  atRiskCount: number;
  newCustomersDelta: number | null;
}): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  const revenue = findMetric(input.metrics, "hub.revenue");
  if (revenue?.changeRatio !== null && revenue?.changeRatio !== undefined) {
    insights.push({
      id: "hub.revenue_growth",
      category: "growth",
      severity:
        revenue.changeRatio > 0.05
          ? "positive"
          : revenue.changeRatio < -0.05
            ? "warning"
            : "info",
      title: "Faturamento vs período anterior",
      message: `Faturamento ${moneyLabel(revenue.value as number)} (${formatRatioPercent(revenue.changeRatio)} vs período anterior).`,
      metricIds: ["hub.revenue"],
      data: { changeRatio: revenue.changeRatio },
    });
  }

  const ticket = findMetric(input.metrics, "hub.ticket");
  if (ticket?.changeRatio !== null && ticket?.changeRatio !== undefined && ticket.previousValue) {
    const delta = (ticket.value as number) - (ticket.previousValue as number);
    insights.push({
      id: "hub.ticket_delta",
      category: "revenue",
      severity: delta >= 0 ? "positive" : "warning",
      title: "Ticket médio",
      message: `Ticket médio ${moneyLabel(ticket.value as number)} (${delta >= 0 ? "+" : ""}${moneyLabel(delta)} vs período anterior).`,
      metricIds: ["hub.ticket"],
    });
  }

  if (input.newCustomersDelta !== null) {
    insights.push({
      id: "hub.new_customers",
      category: "customers",
      severity: input.newCustomersDelta < 0 ? "warning" : "positive",
      title: "Novos clientes",
      message:
        input.newCustomersDelta < 0
          ? `Entrada de novos clientes caiu ${formatRatioPercent(input.newCustomersDelta)}. Investigue marketing, preço e concorrência.`
          : `Entrada de novos clientes cresceu ${formatRatioPercent(input.newCustomersDelta)}.`,
      metricIds: ["hub.new_customers"],
    });
  }

  if (input.peakWeekday) {
    const weekdayRevenue = findMetric(input.metrics, "hub.peak_weekday_share");
    insights.push({
      id: "hub.peak_weekday",
      category: "operations",
      severity: "info",
      title: "Dia mais forte",
      message: `${input.peakWeekday} concentra ${
        weekdayRevenue ? `${weekdayRevenue.value}%` : "boa parte"
      } do faturamento do período — planeje estoque e equipe.`,
      metricIds: ["hub.peak_weekday_share"],
    });
  }

  if (input.peakHour !== null) {
    insights.push({
      id: "hub.peak_hour",
      category: "operations",
      severity: "info",
      title: "Horário de pico",
      message: `Maior volume por volta das ${String(input.peakHour).padStart(2, "0")}:00. Reforce equipe nesse horário.`,
      metricIds: ["hub.peak_hour"],
    });
  }

  if (input.topProducts[0]) {
    const p = input.topProducts[0];
    insights.push({
      id: "hub.top_product",
      category: "products",
      severity: "positive",
      title: "Produto que puxa o faturamento",
      message: `"${p.name}" representa ${(p.revenueShare * 100).toFixed(1)}% da receita do período.`,
      metricIds: ["hub.revenue"],
      data: { name: p.name, share: p.revenueShare },
    });
  }

  if (input.atRiskCount > 0) {
    insights.push({
      id: "hub.customers_at_risk",
      category: "retention",
      severity: "warning",
      title: "Atenção à retenção",
      message: `${input.atRiskCount} clientes em risco de churn. Abra o CRM para priorizar recuperação.`,
      metricIds: ["hub.customers_at_risk"],
    });
  }

  return insights;
}
