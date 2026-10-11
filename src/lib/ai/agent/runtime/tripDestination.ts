// ── CONSULTATIVE_IN_AGENT — the trip-data lookup is made for the PLACE NAME, not "place, province" ─────────────────────────────────────
//
// Measured live (2026-10-11, same Lý Sơn plan request): with the flag OFF the model called get_trip_data("Lý Sơn") and the lookup came back with
// 10 rows (sights, food, hotels) — the plan named Cổng Tò Vò, Hang Câu, Chùa Hang. With the flag ON it called get_trip_data("Lý Sơn, Quảng Ngãi")
// and the sights search returned ONE row, so there was nothing sourced to name and the plan said "điểm ven biển" with no name. The extra
// province made the map search narrower, not more precise. The lookup now uses the part before the first comma (the place name); the model's
// own wording is left untouched everywhere else (frames, plan-area guard).

export const tripSearchName = (destination: string): string => {
  const head = destination.split(/[,;(]/)[0].trim()
  return head.length >= 2 ? head : destination.trim()
}

type Exec = (args: Record<string, unknown>, ctx: unknown) => Promise<unknown>

/** get_trip_data with the destination reduced to the place name. */
export function withTripSearchName(primary: Exec): Exec {
  return (args, ctx) => primary(typeof args.destination === 'string' ? { ...args, destination: tripSearchName(args.destination) } : args, ctx)
}
