/**
 * Analytics engine — official source of business indicators.
 *
 * Designed to be consumed by:
 * - Executive Hub / Reports UI
 * - Future public API
 * - Mobile apps
 * - AI agents (stable metric ids + insights)
 * - Alerts / notifications / TV dashboards
 *
 * Keep this layer free of HTTP/UI concerns.
 */

export { getSalesAnalytics, getCompletedOrderIds } from "./sales.js";
export { getProductAnalytics } from "./products.js";
export { getFinanceAnalytics } from "./finance.js";
export { getCustomerAnalytics } from "./customers.js";
export { getExecutiveHub } from "./hub.js";
export { getRevenueProjection } from "./projections.js";
export {
  previousPeriodOfSameLength,
  parsePeriodStart,
  parsePeriodEnd,
  metric,
  changeRatio,
} from "./period.js";
export { buildCustomerInsights, buildExecutiveInsights } from "./insights.js";
