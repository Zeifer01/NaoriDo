import { describe, expect, test } from "bun:test";
import {
  describeStopReason,
  googleMapsRouteUrl,
  googleMapsStopUrl,
  planDeliveryRoute,
  wazeStopUrl,
  type RouteStopInput,
} from "@restai/config";

// Worcester, MA store; ~0.01° lat ≈ 0.69 mi, ~0.01° lng ≈ 0.51 mi here.
const STORE = { lat: 42.2567, lng: -71.8103 };
const NOW = Date.UTC(2026, 10, 5, 18, 0, 0);
const minsAgo = (m: number) => NOW - m * 60000;

function stop(id: string, dLat: number, dLng: number, ageMin: number): RouteStopInput {
  return { id, lat: STORE.lat + dLat, lng: STORE.lng + dLng, createdAt: minsAgo(ageMin) };
}

const ids = (plan: { id: string }[]) => plan.map((p) => p.id);

describe("planDeliveryRoute", () => {
  test("no stops → empty plan", () => {
    expect(planDeliveryRoute([], STORE, { now: NOW })).toEqual([]);
  });

  test("with similar waits, goes nearest-first along the road", () => {
    const plan = planDeliveryRoute(
      [stop("far", 0.08, 0, 10), stop("near", 0.01, 0, 10), stop("mid", 0.04, 0, 10)],
      STORE,
      { now: NOW },
    );
    expect(ids(plan)).toEqual(["near", "mid", "far"]);
    expect(plan.map((p) => p.position)).toEqual([0, 1, 2]);
  });

  test("a long-waiting order is not left for last just because it is farther", () => {
    const stops = [
      stop("old", 0.04, 0.0, 52),
      stop("f1", -0.02, 0.03, 5),
      stop("f2", -0.03, 0.05, 6),
      stop("f3", -0.01, -0.04, 4),
    ];
    // By distance/total wait alone the 52-min customer would be last (≈109 min wait)…
    const distanceOnly = planDeliveryRoute(stops, STORE, { now: NOW, limitMinutes: 1_000_000 });
    expect(distanceOnly[distanceOnly.length - 1]!.id).toBe("old");
    // …with the 45-min limit he goes first.
    const plan = planDeliveryRoute(stops, STORE, { now: NOW, limitMinutes: 45 });
    expect(plan[0]!.id).toBe("old");
    expect(plan[0]!.reason).toBe("overdue");
  });

  test("an old order just beyond fresh nearby ones is still reached through them (no big detour)", () => {
    const plan = planDeliveryRoute(
      [stop("old", 0.06, 0.04, 55), stop("f1", -0.01, 0.0, 5), stop("f2", 0.0, 0.02, 6)],
      STORE,
      { now: NOW, limitMinutes: 45 },
    );
    expect(plan[plan.length - 1]!.id).toBe("old");
    expect(plan[plan.length - 1]!.reason).toBe("overdue");
  });

  test("an order that will cross the limit before delivery is flagged late_risk", () => {
    const plan = planDeliveryRoute([stop("a", 0.05, 0, 44), stop("b", 0.001, 0, 44)], STORE, {
      now: NOW,
      limitMinutes: 45,
    });
    // both are 44 min old; the second one served necessarily arrives past 45
    expect(plan.some((p) => p.reason === "late_risk" || p.reason === "overdue")).toBe(true);
  });

  test("limit is adjustable: a looser limit stops prioritising the old far order", () => {
    const stops = [stop("near", 0.02, 0, 10), stop("old-far", -0.06, -0.02, 40)];
    const strict = planDeliveryRoute(stops, STORE, { now: NOW, limitMinutes: 45 });
    const loose = planDeliveryRoute(stops, STORE, { now: NOW, limitMinutes: 120 });
    expect(strict[0]!.id).toBe("old-far");
    expect(loose[0]!.id).toBe("near");
  });

  test("stops without coordinates go last, oldest first, flagged unlocated", () => {
    const plan = planDeliveryRoute(
      [
        { id: "x-new", lat: null, lng: null, createdAt: minsAgo(5) },
        stop("ok", 0.02, 0, 20),
        { id: "x-old", lat: null, lng: null, createdAt: minsAgo(30) },
      ],
      STORE,
      { now: NOW },
    );
    expect(ids(plan)).toEqual(["ok", "x-old", "x-new"]);
    expect(plan[1]!.reason).toBe("unlocated");
    expect(plan[1]!.etaMinutes).toBeNull();
  });

  test("works without an origin (picks by age, then proximity)", () => {
    const plan = planDeliveryRoute([stop("a", 0.01, 0, 50), stop("b", 0.02, 0, 5)], null, { now: NOW });
    expect(plan[0]!.id).toBe("a");
  });

  test("handles a 10-stop run quickly and returns every stop once", () => {
    const stops: RouteStopInput[] = [];
    for (let i = 0; i < 10; i++) {
      stops.push(stop(`s${i}`, ((i * 37) % 11) * 0.007, ((i * 53) % 13) * 0.006, 5 + ((i * 17) % 50)));
    }
    const t0 = Date.now();
    const plan = planDeliveryRoute(stops, STORE, { now: NOW });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(new Set(ids(plan)).size).toBe(10);
  });

  test("handles more than 10 stops via local search", () => {
    const stops: RouteStopInput[] = [];
    for (let i = 0; i < 13; i++) {
      stops.push(stop(`s${i}`, ((i * 37) % 11) * 0.007, ((i * 53) % 13) * 0.006, 5 + ((i * 17) % 50)));
    }
    const plan = planDeliveryRoute(stops, STORE, { now: NOW });
    expect(new Set(ids(plan)).size).toBe(13);
  });
});

describe("describeStopReason", () => {
  test("explains why a stop is where it is", () => {
    const plan = planDeliveryRoute([stop("old", 0.05, 0, 55)], STORE, { now: NOW });
    expect(describeStopReason(plan[0]!, 45)).toContain("55 min");
    expect(describeStopReason(plan[0]!, 45)).toContain("45");
  });
});

describe("navigation links", () => {
  test("single stop → Google Maps directions", () => {
    const url = googleMapsStopUrl("12 Main St Apt 3, Worcester, MA");
    expect(url).toContain("destination=12%20Main%20St%20Apt%203%2C%20Worcester%2C%20MA");
    expect(url).toContain("travelmode=driving");
  });

  test("route → last stop is destination, the others are waypoints in order", () => {
    const url = googleMapsRouteUrl(["A st", "B st", "C st"]);
    expect(url).toContain("destination=C%20st");
    expect(url).toContain("waypoints=A%20st%7CB%20st");
  });

  test("route caps at 10 stops (9 waypoints + destination)", () => {
    const addrs = Array.from({ length: 12 }, (_, i) => `S${i}`);
    const url = googleMapsRouteUrl(addrs);
    expect(url).toContain("destination=S9");
    expect(url.split("%7C").length).toBe(9);
  });

  test("waze link navigates to the address", () => {
    expect(wazeStopUrl("1 A St")).toBe("https://waze.com/ul?q=1%20A%20St&navigate=yes");
  });
});
