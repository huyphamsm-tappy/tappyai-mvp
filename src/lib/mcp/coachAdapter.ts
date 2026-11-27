import { resolveCommerce, capabilityForIntent, type CommerceRequest } from '@/lib/ccp'
import type { ServiceAdapter } from './serviceMap'

// The 'coach.link' service of the Gateway (27/11/2026): the DATED Vexere route page for a coach route, with Tappy's tracking. Tappy has no timetable, price or seat source for coaches (Vexere publishes no API
// to us), so this says what it has and nothing more. The page is found by the SAME discovery the chat uses (a scoped web search, cached 24 h) and turned into a link by the commerce layer (CCP), which validates the
// page against Vexere's own URL grammar, adds the date and applies the affiliate tracking. No route page found, or a page for other places, or the date in the past → NO row: never the front door, never a made-up link.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const slug = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
const dayFrom = (offsetDays: number): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)
const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, 80) : '')

export type CoachDiscovery = (subject: string) => Promise<Array<{ url: string; title?: string }>>

/** The chat's own discovery of merchant route pages (a scoped web search through the tool layer's Serper cache and budget). Imported lazily: only a coach call loads it. */
const chatDiscovery: CoachDiscovery = async subject => {
  const { discoverBySubject } = await import('@/lib/ai/tools/commerceDiscovery')
  return discoverBySubject('travel', 'book_transport', subject, undefined, { perScope: 3 })
}

export function makeCoachAdapter(discover: CoachDiscovery = chatDiscovery): ServiceAdapter {
  return async c => {
    const origin = clean(c.origin), destination = clean(c.destination)
    if (!origin || !destination) return { rows: [] }
    const departDate = c.departDate && ISO_DATE.test(c.departDate) ? c.departDate : dayFrom(7)
    if (departDate < dayFrom(0)) return { rows: [] }
    const originRef = slug(origin), destinationRef = slug(destination)
    if (!originRef || !destinationRef) return { rows: [] }

    let hints: Array<{ url: string; title: string }> = []
    try {
      const hits = await discover(`xe khách ${origin} ${destination}`)
      hints = hits
        .filter(h => { try { const host = new URL(h.url).hostname.toLowerCase(); return host === 'vexere.com' || host.endsWith('.vexere.com') } catch { return false } })
        .map(h => ({ url: h.url, title: h.title ?? `${origin} → ${destination}` }))
    } catch { return { rows: [] } }
    if (hints.length === 0) return { rows: [] }

    const subject = `${origin} → ${destination}`.slice(0, 200)
    const request: CommerceRequest = {
      domain: 'travel', intentType: 'book_transport', capability: capabilityForIntent('book_transport'), subject,
      configuration: { kind: 'transport', originRef, destinationRef, departDate, mode: 'bus' }, context: { allowTracking: true },
    }
    const out = resolveCommerce(request, { hints, now: new Date(), enabled: true })
    if (!('links' in out)) return { rows: [] }
    // A route page lands at depth 2 or more; the front door (depth 0) is not a route link.
    const link = out.links.find(l => l.providerId === 'vexere' && l.depth >= 2 && l.url.startsWith('https://'))
    if (!link) return { rows: [] }
    return { rows: [{ id: link.linkId, title: `Vexere: ${subject}`, route: subject, departDate, merchant: 'Vexere', url: link.url }] }
  }
}

export const coachAdapter: ServiceAdapter = makeCoachAdapter()
