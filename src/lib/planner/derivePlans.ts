import { parsePlan } from '@/lib/structuredContent/parsePlan'
import type { TappyPlan, PlanItem } from '@/components/TripPlanCard'

// ── My Plans, derived — not stored ──────────────────────────────────────────
//
// 🚨 THERE IS NO `plans` TABLE, AND THIS FILE IS THE REASON THERE DOES NOT NEED TO BE ONE.
//
// A plan is already persisted: the assistant emits `[TAPPY_PLAN]{…}[/TAPPY_PLAN]` inside its
// reply, and `conversations.messages` (jsonb) stores the reply CONTENT VERBATIM, marker included
// — that is what lets a plan survive a reload inside the thread today. So the user's plans are
// sitting in data they already own, under RLS they already have, mirrored to Android and iOS by
// a contract that already ships. This module reads them. It writes nothing, caches nothing, and
// adds no second copy that could disagree with the thread it came from.
//
// 🚨 EVERY FIELD BELOW IS READ OR COUNTED — NONE IS INVENTED.
//
// The reference mockup for this surface showed plan cards carrying a date range, a traveller
// count, a cover photograph and a status pill ("Đang lên kế hoạch" / "Đã hoàn thành"). Three of
// those four have NO counterpart anywhere in the product:
//
//   • DATES — `PlanDay.label` is free text the model writes ("Ngày 1", "Tối nay"). There is no
//     start date, no end date, and no field that could hold one. A rendered "05/06 → 06/06" would
//     be a fabrication about the user's calendar.
//   • STATUS — plans have no lifecycle. Nothing sets, stores or transitions a status, so a badge
//     saying "completed" would assert something no code could ever have observed.
//   • COVER — there is no plan-level image. There IS a real per-ITEM `photo_url`, injected
//     server-side by `streamEnrichment.injectPlanPhotos` from a matched place, so `coverUrl`
//     below is the FIRST REAL PHOTO OF A REAL STOP and null when the plan has none. No
//     placeholder pool, no destination-guessed stock art.
//
// `people` is the one screenshot field that is real (`TappyPlan.people`), and it is optional —
// so it renders only when the model actually recorded it.
//
// 🚨 CATEGORY IS `type`, AND `type` HAS TWO VALUES. `detectPlanningIntent` returns
// 'trip' | 'evening' and the prompt writes that same value into the payload. "Travel / Work /
// Personal" was a three-way taxonomy with no producer: nothing in this codebase can emit a work
// plan or a personal plan, so a Work filter would be a control that is guaranteed to find
// nothing. The Planner builds its filters from the types actually present instead — see
// `plannerFacets`.

/** Exactly the columns the Planner selects. Kept narrow so the page cannot quietly grow the read. */
export interface PlannerConversationRow {
  id: string
  title: string | null
  updated_at: string
  messages: unknown
}

/** The two values `TappyPlan.type` can carry. Anything else is treated as unknown, never coerced. */
export type PlanKind = 'trip' | 'evening'

export interface DerivedPlan {
  /** Stable across renders and reloads: a plan is identified by where it lives. */
  id: string
  conversationId: string
  /** Where the plan opens. The full itinerary already renders there, in `TripPlanCard`. */
  href: string
  /** `TappyPlan.title`, falling back to the conversation's own title — both are real strings the
   *  user has already seen. Never a title assembled out of guessed facts. */
  title: string
  /** null when the model wrote neither 'trip' nor 'evening'. The UI shows no kind rather than a guess. */
  kind: PlanKind | null
  /** The conversation's `updated_at`. It is the LAST TIME THE THREAD CHANGED, which is not the same
   *  claim as "the plan was edited" — the UI must label it as thread activity, not as a plan date. */
  updatedAt: string
  people: number | null
  /** Free text from the model ("khoảng 5 triệu"), never parsed into a number — the contract says
   *  string, Android and iOS decode it as a string, and arithmetic on it would be invention. */
  budgetTotal: string | null
  dayCount: number
  stopCount: number
  /** Real `PlanItem.category` values, first-seen order, de-duplicated. */
  categories: string[]
  /** First real per-stop photo, or null. */
  coverUrl: string | null
  /** The first few stops, for a preview that shows the plan instead of describing it. */
  stops: PlanItem[]
  /** The decoded payload, so a caller can render the full itinerary without re-parsing. */
  plan: TappyPlan
}

function isKind(v: unknown): v is PlanKind {
  return v === 'trip' || v === 'evening'
}

function isPlanItem(v: unknown): v is PlanItem {
  return !!v && typeof v === 'object' && typeof (v as PlanItem).name === 'string'
}

/** Every item across every day, in itinerary order. */
function itemsOf(plan: TappyPlan): PlanItem[] {
  return plan.days.flatMap((d) => (Array.isArray(d?.items) ? d.items.filter(isPlanItem) : []))
}

/**
 * One conversation → the plans inside it.
 *
 * 🔑 A THREAD CAN HOLD MORE THAN ONE PLAN and they are NOT collapsed. Asking Tappy to redo a trip
 * produces a second `[TAPPY_PLAN]` in the same conversation; both are real replies the user
 * received, so both are listed. Keying on the message index is what keeps them distinct and
 * stable — a plan's identity is its position in the thread, which does not move.
 *
 * Only ASSISTANT messages are read. A user who pastes the marker text back into the composer has
 * not made a plan, and their own message must not become a card on this page.
 */
export function plansInConversation(row: PlannerConversationRow): DerivedPlan[] {
  const messages = Array.isArray(row.messages) ? row.messages : []
  const out: DerivedPlan[] = []

  messages.forEach((raw, index) => {
    const m = raw as { role?: unknown; content?: unknown } | null
    if (!m || m.role !== 'assistant' || typeof m.content !== 'string') return
    if (!m.content.includes('[TAPPY_PLAN]')) return

    const { plan } = parsePlan(m.content)
    // `parsePlan` returns null for an unterminated or malformed block — a plan that never finished
    // arriving. There is nothing to show for one, and inventing a placeholder card for a failed
    // stream would tell the user they have a plan they do not have.
    if (!plan) return

    const items = itemsOf(plan)
    const title = (typeof plan.title === 'string' && plan.title.trim()) || (row.title ?? '').trim()
    if (!title) return // nothing real to name the card with

    const categories: string[] = []
    for (const it of items) {
      if (typeof it.category === 'string' && it.category && !categories.includes(it.category)) {
        categories.push(it.category)
      }
    }

    out.push({
      id: `${row.id}#${index}`,
      conversationId: row.id,
      href: `/chat/${row.id}`,
      title,
      kind: isKind(plan.type) ? plan.type : null,
      updatedAt: row.updated_at,
      people: typeof plan.people === 'number' && plan.people > 0 ? plan.people : null,
      budgetTotal: typeof plan.budget_total === 'string' && plan.budget_total.trim() ? plan.budget_total : null,
      dayCount: plan.days.length,
      stopCount: items.length,
      categories,
      coverUrl: items.find((i) => typeof i.photo_url === 'string' && i.photo_url)?.photo_url ?? null,
      stops: items.slice(0, 3),
      plan,
    })
  })

  return out
}

/**
 * The user's conversations → My Plans, newest thread first.
 *
 * The rows arrive already ordered by `updated_at desc` from the query, and plans within a thread
 * keep their itinerary order, so the sort is stable without a second comparator.
 */
export function derivePlans(rows: PlannerConversationRow[]): DerivedPlan[] {
  return rows.flatMap(plansInConversation)
}

/**
 * The filter chips, derived from the plans in hand.
 *
 * 🚨 A FILTER THAT CANNOT MATCH ANYTHING IS NOT SHOWN. This returns only the kinds actually
 * present, so a user with three trips and no evening plans sees "All · Trips" — two controls that
 * both do something — instead of a row of tabs where two are permanently empty. With one kind or
 * fewer the row disappears entirely: filtering a list into itself is not a feature.
 *
 * Plans whose `type` is null are reachable through All and are never hidden by a chip that claims
 * to be showing everything of some kind.
 */
export function plannerFacets(plans: DerivedPlan[]): PlanKind[] {
  const order: PlanKind[] = ['trip', 'evening']
  const present = order.filter((k) => plans.some((p) => p.kind === k))
  return present.length > 1 ? present : []
}
