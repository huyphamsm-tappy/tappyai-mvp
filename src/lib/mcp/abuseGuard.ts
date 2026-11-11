// Spatial / temporal anti-scraping (connector doc §10, ADR-CONN-013): a minimal, PURE first layer. TVI is a curated asset and an agent could extract it by walking coordinates and rotating categories,
// which a request counter alone does not see early. Signals here: how many distinct coarse geographic cells and distinct tool categories one principal touched in a sliding window.
//
// HONEST LIMITS: (1) the thresholds are PLACEHOLDERS, not calibrated against real travel behaviour (the connector doc requires that calibration); (2) the state is per-instance memory, so with several
// serverless instances a scraper sees a fraction of its own history: this is a skeleton, NOT the production defence, which needs the shared store; (3) it only sees coordinates, not free-text places.
// Client coordinates are untrusted input; the cell is deliberately coarse (about 5 km) so no precise location history is kept. Escalation is progressive and never a permanent block.
export type RiskLevel = 'normal' | 'suspicious' | 'elevated' | 'high'
export interface Observation { lat?: number; lng?: number; tool: string }
export interface Verdict { level: RiskLevel; /** multiply the allowed result depth by this (1 = unchanged) */ depthFactor: number }
export interface AbuseMonitor { observe(principalId: string, o: Observation): Verdict; size(): number }

const CELL_DEG = 0.05
/** distinct cells in the window that move the level up (a multi-district city itinerary touches about 3-8) */
const CELLS = { suspicious: 10, elevated: 18, high: 32 } as const
/** with this many distinct categories on top of many cells the level goes one step higher */
const CATEGORY_BOOST = 4

// the epsilon keeps a value that is a whole number of cells (10.35 / 0.05 = 206.99999999999997) in its own cell instead of the one below
const cellOf = (lat: number, lng: number): string => `${Math.floor(lat / CELL_DEG + 1e-9)}:${Math.floor(lng / CELL_DEG + 1e-9)}`
const validCoord = (lat?: number, lng?: number): lat is number => typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

export function createAbuseMonitor(o: { now?: () => Date; windowMs?: number; maxPrincipals?: number } = {}): AbuseMonitor {
  const now = o.now ?? (() => new Date())
  const windowMs = o.windowMs ?? 10 * 60_000
  const maxPrincipals = o.maxPrincipals ?? 5_000
  const state = new Map<string, Array<{ t: number; cell: string | null; tool: string }>>()

  return {
    observe(principalId, ob) {
      const t = now().getTime()
      const hist = (state.get(principalId) ?? []).filter(e => t - e.t <= windowMs)
      hist.push({ t, cell: validCoord(ob.lat, ob.lng) ? cellOf(ob.lat, ob.lng as number) : null, tool: ob.tool })
      state.delete(principalId); state.set(principalId, hist) // Map keeps insertion order: the most recently seen principal goes last
      while (state.size > maxPrincipals) { const oldest = state.keys().next().value as string; state.delete(oldest) }

      const cells = new Set(hist.map(e => e.cell).filter((c): c is string => c !== null)).size
      const tools = new Set(hist.filter(e => e.cell !== null).map(e => e.tool)).size
      let rank = cells >= CELLS.high ? 3 : cells >= CELLS.elevated ? 2 : cells >= CELLS.suspicious ? 1 : 0
      if (rank > 0 && tools >= CATEGORY_BOOST) rank = Math.min(3, rank + 1)
      const level: RiskLevel = (['normal', 'suspicious', 'elevated', 'high'] as const)[rank]
      return { level, depthFactor: level === 'elevated' ? 0.4 : level === 'high' ? 0 : 1 }
    },
    size: () => state.size,
  }
}
