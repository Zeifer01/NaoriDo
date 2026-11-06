/**
 * Delivery route suggestion for the "Entregas" screen (org flag `delivery_dispatch`).
 *
 * Goal: order a driver's stops so nobody waits too long. Plain "nearest next" lets a
 * far-away customer who ordered 55 minutes ago be served last. Instead we minimise the
 * total customer wait with a heavy extra penalty for every minute past the wait limit
 * (default 45 min, configurable per branch):
 *
 *   cost(stop) = wait + OVERDUE_PENALTY * max(0, wait - limit)      wait = age now + time on the road
 *
 * so an order that is already (or about to be) late goes first unless that detour makes
 * several other orders late. The driver can always reorder by hand — this is a suggestion.
 *
 * Travel time is estimated from straight-line distance (haversine) with a detour factor
 * and an average urban speed; good enough for 2–10 stops inside one metro area.
 */
import { haversineMiles } from "./delivery-pricing";

export const DEFAULT_DELIVERY_WAIT_LIMIT_MINUTES = 45;

const DETOUR_FACTOR = 1.35; // road distance ≈ 1.35 × straight line
const AVG_SPEED_MPH = 22; // urban average including lights
const STOP_MINUTES = 4; // handing over the order at each stop
const OVERDUE_PENALTY = 4; // extra weight per minute past the limit
const MAX_SEARCH_NODES = 1_500_000;

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteStopInput {
  id: string;
  lat: number | null;
  lng: number | null;
  /** When the order was placed (wait time counts from here). */
  createdAt: Date | string | number;
}

export type RouteStopReason =
  /** Already waiting longer than the limit. */
  | "overdue"
  /** Will pass the limit before it can be delivered. */
  | "late_risk"
  /** Normal stop on the way. */
  | "route"
  /** Address could not be located on the map — placed last. */
  | "unlocated";

export interface PlannedStop {
  id: string;
  /** 0-based position in the suggested order. */
  position: number;
  /** Minutes from now until arrival (null when the stop has no coordinates). */
  etaMinutes: number | null;
  /** Minutes the customer will have waited when the driver arrives. */
  waitAtArrival: number;
  /** Minutes the customer has been waiting right now. */
  waitNow: number;
  reason: RouteStopReason;
}

export interface RouteOptions {
  /** "Now" in ms (testing). Defaults to Date.now(). */
  now?: number;
  /** Wait limit in minutes. Defaults to 45. */
  limitMinutes?: number;
}

function toMs(v: Date | string | number): number {
  return v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime();
}

function travelMinutes(a: RoutePoint, b: RoutePoint): number {
  const miles = haversineMiles(a, b) * DETOUR_FACTOR;
  return (miles / AVG_SPEED_MPH) * 60;
}

interface Located {
  id: string;
  point: RoutePoint;
  age: number; // minutes waiting now
}

/** Cost of one delivery given the minutes the customer has waited on arrival. */
function stopCost(wait: number, limit: number): number {
  return wait + OVERDUE_PENALTY * Math.max(0, wait - limit);
}

/** Total cost of visiting `order` (indexes into `stops`) starting at `origin`. */
function routeCost(
  stops: Located[],
  order: number[],
  origin: RoutePoint | null,
  limit: number,
): number {
  let t = 0;
  let prev: RoutePoint | null = origin;
  let cost = 0;
  for (let i = 0; i < order.length; i++) {
    const s = stops[order[i]!]!;
    if (prev) t += travelMinutes(prev, s.point);
    cost += stopCost(s.age + t, limit);
    t += STOP_MINUTES;
    prev = s.point;
  }
  return cost;
}

/** Quick seed: repeatedly take the stop that is cheapest to deliver next. */
function greedyOrder(stops: Located[], origin: RoutePoint | null, limit: number): number[] {
  const remaining = new Set(stops.map((_, i) => i));
  const order: number[] = [];
  let t = 0;
  let prev: RoutePoint | null = origin;
  while (remaining.size > 0) {
    let best = -1;
    let bestScore = Infinity;
    for (const i of remaining) {
      const s = stops[i]!;
      const leg = prev ? travelMinutes(prev, s.point) : 0;
      // Delaying everyone else by `leg` + own (possibly overdue) cost.
      const score = leg * (remaining.size - 1) + stopCost(s.age + t + leg, limit);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const s = stops[best]!;
    t += (prev ? travelMinutes(prev, s.point) : 0) + STOP_MINUTES;
    prev = s.point;
    order.push(best);
    remaining.delete(best);
  }
  return order;
}

/** Exact depth-first search with pruning (≤ 10 stops), seeded by the greedy order. */
function searchBest(stops: Located[], origin: RoutePoint | null, limit: number): number[] {
  const n = stops.length;
  let bestOrder = greedyOrder(stops, origin, limit);
  let bestCost = routeCost(stops, bestOrder, origin, limit);
  if (n <= 1) return bestOrder;

  let nodes = 0;
  const used = new Array<boolean>(n).fill(false);
  const current: number[] = [];

  const dfs = (prev: RoutePoint | null, t: number, cost: number) => {
    if (nodes++ > MAX_SEARCH_NODES) return;
    if (cost >= bestCost) return;
    if (current.length === n) {
      bestCost = cost;
      bestOrder = [...current];
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const s = stops[i]!;
      const arrive = t + (prev ? travelMinutes(prev, s.point) : 0);
      used[i] = true;
      current.push(i);
      dfs(s.point, arrive + STOP_MINUTES, cost + stopCost(s.age + arrive, limit));
      current.pop();
      used[i] = false;
    }
  };
  dfs(origin, 0, 0);
  return bestOrder;
}

/** Local improvement (swap / move) for bigger runs where exact search is too slow. */
function improve(stops: Located[], start: number[], origin: RoutePoint | null, limit: number): number[] {
  let order = [...start];
  let cost = routeCost(stops, order, origin, limit);
  let better = true;
  let guard = 0;
  while (better && guard++ < 50) {
    better = false;
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        if (i === j) continue;
        const cand = [...order];
        const [moved] = cand.splice(i, 1);
        cand.splice(j, 0, moved!);
        const c = routeCost(stops, cand, origin, limit);
        if (c + 1e-9 < cost) {
          order = cand;
          cost = c;
          better = true;
        }
      }
    }
  }
  return order;
}

/**
 * Suggest the order of `stops`. Stops without coordinates go last (oldest first) and are
 * marked `unlocated` so the UI can ask the driver to check them.
 */
export function planDeliveryRoute(
  stops: RouteStopInput[],
  origin: RoutePoint | null,
  options: RouteOptions = {},
): PlannedStop[] {
  const now = options.now ?? Date.now();
  const limit = options.limitMinutes ?? DEFAULT_DELIVERY_WAIT_LIMIT_MINUTES;

  const ageOf = (s: RouteStopInput) => Math.max(0, (now - toMs(s.createdAt)) / 60000);

  const located: Located[] = [];
  const unlocated: RouteStopInput[] = [];
  for (const s of stops) {
    if (typeof s.lat === "number" && typeof s.lng === "number" && Number.isFinite(s.lat) && Number.isFinite(s.lng)) {
      located.push({ id: s.id, point: { lat: s.lat, lng: s.lng }, age: ageOf(s) });
    } else {
      unlocated.push(s);
    }
  }

  const order =
    located.length <= 10
      ? searchBest(located, origin, limit)
      : improve(located, greedyOrder(located, origin, limit), origin, limit);

  const result: PlannedStop[] = [];
  let t = 0;
  let prev: RoutePoint | null = origin;
  for (const idx of order) {
    const s = located[idx]!;
    if (prev) t += travelMinutes(prev, s.point);
    const waitAtArrival = s.age + t;
    result.push({
      id: s.id,
      position: result.length,
      etaMinutes: Math.round(t),
      waitAtArrival: Math.round(waitAtArrival),
      waitNow: Math.round(s.age),
      reason: s.age >= limit ? "overdue" : waitAtArrival > limit ? "late_risk" : "route",
    });
    t += STOP_MINUTES;
    prev = s.point;
  }

  unlocated
    .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt))
    .forEach((s) => {
      const age = ageOf(s);
      result.push({
        id: s.id,
        position: result.length,
        etaMinutes: null,
        waitAtArrival: Math.round(age),
        waitNow: Math.round(age),
        reason: "unlocated",
      });
    });

  return result;
}

/**
 * Simulate a route in the order the driver chose (not necessarily the suggestion) so the
 * screen can still show ETA and wait-at-arrival per stop. Unlocated stops don't move the
 * "current position" and have no ETA.
 */
export function evaluateDeliveryRoute(
  orderedStops: RouteStopInput[],
  origin: RoutePoint | null,
  options: RouteOptions = {},
): PlannedStop[] {
  const now = options.now ?? Date.now();
  const limit = options.limitMinutes ?? DEFAULT_DELIVERY_WAIT_LIMIT_MINUTES;
  const result: PlannedStop[] = [];
  let t = 0;
  let prev: RoutePoint | null = origin;
  for (const s of orderedStops) {
    const age = Math.max(0, (now - toMs(s.createdAt)) / 60000);
    const hasPoint =
      typeof s.lat === "number" && typeof s.lng === "number" && Number.isFinite(s.lat) && Number.isFinite(s.lng);
    if (!hasPoint) {
      result.push({
        id: s.id,
        position: result.length,
        etaMinutes: null,
        waitAtArrival: Math.round(age + t),
        waitNow: Math.round(age),
        reason: "unlocated",
      });
      t += STOP_MINUTES;
      continue;
    }
    const point = { lat: s.lat as number, lng: s.lng as number };
    if (prev) t += travelMinutes(prev, point);
    const waitAtArrival = age + t;
    result.push({
      id: s.id,
      position: result.length,
      etaMinutes: Math.round(t),
      waitAtArrival: Math.round(waitAtArrival),
      waitNow: Math.round(age),
      reason: age >= limit ? "overdue" : waitAtArrival > limit ? "late_risk" : "route",
    });
    t += STOP_MINUTES;
    prev = point;
  }
  return result;
}

/** Reason chip text for the driver ("Espera de 55 min — passou do limite"). */
export function describeStopReason(stop: PlannedStop, limitMinutes = DEFAULT_DELIVERY_WAIT_LIMIT_MINUTES): string {
  switch (stop.reason) {
    case "overdue":
      return `Espera de ${stop.waitNow} min — passou de ${limitMinutes}`;
    case "late_risk":
      return `Chega com ${stop.waitAtArrival} min de espera`;
    case "unlocated":
      return "Endereço não localizado no mapa — confira";
    default:
      return stop.etaMinutes != null ? `No caminho · ~${stop.etaMinutes} min` : "No caminho";
  }
}

// ── Navigation links ──────────────────────────────────────────────

/** Google Maps directions to one address (works on iOS/Android/desktop; opens the app if installed). */
export function googleMapsStopUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
}

/**
 * Google Maps with several stops in order, starting from the device's current location.
 * Maps accepts up to 9 waypoints + the destination (10 stops); extra stops are ignored.
 */
export function googleMapsRouteUrl(addresses: string[]): string {
  const stops = addresses.filter((a) => a && a.trim()).slice(0, 10);
  if (stops.length === 0) return "https://www.google.com/maps";
  if (stops.length === 1) return googleMapsStopUrl(stops[0]!);
  const destination = stops[stops.length - 1]!;
  const waypoints = stops.slice(0, -1).map(encodeURIComponent).join("%7C");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&waypoints=${waypoints}&travelmode=driving`;
}

/** Waze navigation to one address (Waze takes a single destination at a time). */
export function wazeStopUrl(address: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}
