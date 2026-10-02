import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { derivePlans, type PlannerConversationRow } from '@/lib/planner/derivePlans'
import PlannerView from './PlannerView'

// ── V3 Web · AI Planner (My Plans) ──────────────────────────────────────────
//
// 🚨 THIS IS A DESTINATION, NOT A HOME PANEL. The first V3 build put a Planner card on Home
// alongside fourteen others; `fda000d` took the dashboard apart and `homeAiFirst.test.tsx` now
// asserts Home renders exactly four sections and reproduces no other destination's content. So
// the Planner gets a route, which is what the shell's nav row always claimed it had.
//
// 🚨 NO NEW TABLE, NO NEW API, NO NEW WRITE PATH. Plans are read out of `conversations` — the
// user's own rows, under the RLS policy that already governs them — and turned into cards by
// `derivePlans`. Nothing on this page is stored; there is nothing here to keep in sync.
//
// 🚨 AUTH-GATED, like the rest of `/profile/*`. My Plans is a personal surface; there is no
// signed-out version of "your plans" that would not be either empty or a lie.

/**
 * How many recent threads are scanned for plans.
 *
 * 🔑 A WINDOW, DELIBERATELY, AND THE PAGE SAYS SO. `messages` is a jsonb blob capped at 512 KB
 * per conversation by `/api/conversations`, so an unbounded select is a multi-megabyte read on a
 * page that renders a list. Postgres cannot filter on the marker without a substring predicate
 * over that blob — which would need an RPC, i.e. the new backend this work was explicitly not to
 * build — so the bound is a row count instead.
 *
 * 40 is deliberately WIDER than the app's own history surfaces (the conversations API exposes 20,
 * Home loads 5), so no plan visible anywhere else in the product is missing here. `v3.planner.scope`
 * tells the user the list comes from their recent conversations rather than letting an older plan
 * vanish without explanation.
 */
const CONVERSATION_WINDOW = 40

export default async function PlannerPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: conversations }] = await Promise.all([
    supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single(),
    supabase
      .from('conversations')
      .select('id, title, updated_at, messages')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(CONVERSATION_WINDOW),
  ])

  // Email always from session (auth.users.email); profiles.email is being removed.
  const userInfo = {
    full_name: profile?.full_name ?? user.user_metadata?.full_name,
    avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url,
    email: user.email,
  }

  const plans = derivePlans((conversations ?? []) as PlannerConversationRow[])

  return <PlannerView user={userInfo} plans={plans} />
}
