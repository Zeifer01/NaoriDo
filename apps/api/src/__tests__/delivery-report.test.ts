import { describe, expect, test } from "bun:test";
import { buildDeliveryReport, summarize, type DeliveryReportRow } from "../services/delivery-report";

const TZ = "America/New_York";
// 2026-11-05 18:00 New York = 23:00Z (EST, UTC-5)
const at = (iso: string) => new Date(iso);

function row(p: Partial<DeliveryReportRow> & { created: string; claimed: string; delivered: string }): DeliveryReportRow {
  return {
    driverId: p.driverId ?? "erik",
    driverName: p.driverName ?? "Erik",
    orderId: p.orderId ?? Math.random().toString(36).slice(2),
    orderNumber: p.orderNumber ?? "1",
    orderCreatedAt: at(p.created),
    claimedAt: at(p.claimed),
    deliveredAt: at(p.delivered),
    totalCents: p.totalCents ?? 4000,
    deliveryFeeCents: p.deliveryFeeCents ?? 300,
    city: p.city ?? "Worcester",
    address: p.address ?? "1 Main St",
    paymentMethod: p.paymentMethod ?? "zelle",
    cashCollectedCents: p.cashCollectedCents ?? 0,
    tipCents: p.tipCents ?? 0,
    tipMethod: p.tipMethod ?? null,
  };
}

describe("summarize", () => {
  test("counts, values, times, limit and tips", () => {
    const rows = [
      row({ created: "2026-11-05T22:00:00Z", claimed: "2026-11-05T22:20:00Z", delivered: "2026-11-05T22:35:00Z", totalCents: 5000, tipCents: 500, tipMethod: "cash", cashCollectedCents: 5000 }),
      row({ created: "2026-11-05T22:10:00Z", claimed: "2026-11-05T22:20:00Z", delivered: "2026-11-05T23:10:00Z", totalCents: 3000 }),
    ];
    const s = summarize(rows, 45);
    expect(s.deliveries).toBe(2);
    expect(s.valueCents).toBe(8000);
    expect(s.avgTicketCents).toBe(4000);
    expect(s.avgTotalMinutes).toBe(47.5); // (35 + 60) / 2
    expect(s.medianTotalMinutes).toBe(47.5);
    expect(s.avgToPickupMinutes).toBe(15); // (20 + 10) / 2
    expect(s.avgOnRoadMinutes).toBe(32.5); // (15 + 50) / 2
    expect(s.withinLimitPct).toBe(50); // only the 35-min one
    expect(s.tipsCents).toBe(500);
    expect(s.tippedPct).toBe(50);
    expect(s.avgTipCents).toBe(500);
    expect(s.cashCollectedCents).toBe(5000);
    expect(s.feeCents).toBe(600);
  });

  test("a delivery marked 'Entregue' hours late is counted but kept out of the time averages", () => {
    const rows = [
      row({ created: "2026-11-05T22:00:00Z", claimed: "2026-11-05T22:10:00Z", delivered: "2026-11-05T22:30:00Z" }),
      row({ created: "2026-11-05T14:00:00Z", claimed: "2026-11-05T14:10:00Z", delivered: "2026-11-05T22:40:00Z" }),
    ];
    const s = summarize(rows, 45);
    expect(s.deliveries).toBe(2);
    expect(s.timeExcluded).toBe(1);
    expect(s.avgTotalMinutes).toBe(30);
  });

  test("empty period has no averages and no divide-by-zero", () => {
    const s = summarize([], 45);
    expect(s.deliveries).toBe(0);
    expect(s.avgTotalMinutes).toBeNull();
    expect(s.withinLimitPct).toBeNull();
    expect(s.avgTicketCents).toBe(0);
  });
});

describe("buildDeliveryReport", () => {
  const rows = [
    row({ driverId: "erik", driverName: "Erik", orderNumber: "6", created: "2026-11-05T22:00:00Z", claimed: "2026-11-05T22:15:00Z", delivered: "2026-11-05T22:30:00Z", city: "Worcester", tipCents: 300, tipMethod: "zelle" }),
    row({ driverId: "erik", driverName: "Erik", orderNumber: "7", created: "2026-11-05T22:05:00Z", claimed: "2026-11-05T22:15:00Z", delivered: "2026-11-05T22:50:00Z", city: "Auburn" }),
    row({ driverId: "julia", driverName: "Julia", orderNumber: "8", created: "2026-11-06T22:00:00Z", claimed: "2026-11-06T22:10:00Z", delivered: "2026-11-06T22:25:00Z", city: "Worcester", tipCents: 200, tipMethod: "cash" }),
  ];
  const report = buildDeliveryReport({
    rows,
    previousRows: [rows[0]!],
    start: "2026-11-04",
    end: "2026-11-07",
    limitMinutes: 45,
    timeZone: TZ,
  });

  test("per-driver stats are sorted by deliveries and carry tips by method", () => {
    expect(report.drivers.map((d) => d.driverId)).toEqual(["erik", "julia"]);
    expect(report.drivers[0]!.deliveries).toBe(2);
    expect(report.drivers[0]!.tipsByMethod).toEqual({ zelle: 300 });
    expect(report.drivers[1]!.tipsByMethod).toEqual({ cash: 200 });
  });

  test("daily series is zero-filled over the whole period, split by driver", () => {
    expect(report.daily.map((d) => d.date)).toEqual(["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]);
    expect(report.daily.map((d) => d.total)).toEqual([0, 2, 1, 0]);
    expect(report.daily[1]!["erik"]).toBe(2);
    expect(report.daily[2]!["julia"]).toBe(1);
  });

  test("hours/weekdays use the branch timezone (17:30 New York, not UTC)", () => {
    const h17 = report.byHour.find((h) => h.hour === "17h");
    expect(h17?.deliveries).toBe(3); // 22:30Z, 22:50Z, 22:25Z → 17:30, 17:50, 17:25 EST
    expect(report.byWeekday.find((w) => w.label === "Quinta")?.deliveries).toBe(2); // 2026-11-05 is a Thursday
    expect(report.byWeekday.find((w) => w.label === "Sexta")?.deliveries).toBe(1);
  });

  test("cities, slowest deliveries, totals and previous period", () => {
    expect(report.byCity[0]).toMatchObject({ city: "Worcester", deliveries: 2 });
    expect(report.slowest[0]!.orderNumber).toBe("7"); // 45 min
    expect(report.slowest[0]!.totalMinutes).toBe(45);
    expect(report.summary.deliveries).toBe(3);
    expect(report.previous?.deliveries).toBe(1);
    expect(report.tipsByMethod).toEqual({ zelle: 300, cash: 200 });
  });
});
