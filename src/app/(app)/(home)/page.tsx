import { createClient } from '@/lib/supabase/server'
import { getDynamicPrompts } from '@/lib/suggestedPrompts'
import { getMemory } from '@/lib/memory/memoryService'
// V3 Web redesign — the Home surface is now the V3 panel grid. `HomeView` (the
// pre-V3 single-column composition) is retained in the tree unreferenced so the
// old layout stays available for comparison during the visual review gate.
import HomeV3 from '@/app/HomeV3'
import { getDemographics, toPromptGender } from '@/lib/account/demographics'
import { getAgeEligibility } from '@/lib/account/ageEligibility'
import { redirect } from 'next/navigation'
import { vietnamHeroClock } from '@/lib/home/heroGreeting'
import { siteJsonLd } from '@/lib/discovery/siteJsonLd'
import type { Metadata } from 'next'
import { absoluteUrl } from '@/lib/share/openGraph'

// The one canonical for the home page. The root layout's metadata carries the
// title/OG for every page but deliberately no canonical (a layout-level
// canonical would be inherited by /chat, /profile and every private route);
// the home page states its own, and that a query string (`?src=qr_pos`, the
// attribution entries) is never a second page.
export const metadata: Metadata = {
  alternates: { canonical: absoluteUrl('/') },
  robots: { index: true, follow: true },
}

export default async function HomePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  let conversations: { id: string; title: string; category: string; updated_at: string; messages: unknown }[] | null = null
  let memory = null
  // V3 — gender now comes from the canonical `user_demographics` row rather
  // than `auth.users.raw_user_meta_data`, which any signed-in user could write
  // to with `supabase.auth.updateUser` and which offered only male/female.
  let promptGender: 'male' | 'female' | null = null

  // ── V3 User Data Foundation: the web counterpart of Android's cold-start check ──
  //
  // 🚨 THE EXISTING USER BASE NEVER PASSES THE AUTH-CALLBACK GATE.
  //    That redirect fires on a LOGIN transition. Everyone already holding a
  //    session when this ships walks straight past it, so without this they
  //    reach the app and meet a bare 403 on their first action.
  //
  // Server-side and inside the batch that was already running, so it costs one
  // more parallel read on the entry point rather than a client round trip. It is
  // convenience, not enforcement — every product API refuses independently, so
  // deep-linking past this page changes nothing about what the account can do.
  //
  // Anonymous sessions are excluded: no age data is collected for them, they
  // have no `profiles` row to hold one, and public/marketing surfaces stay open.
  if (user && !user.is_anonymous) {
    const eligibility = await getAgeEligibility(supabase)
    if (eligibility.status !== 'eligible') redirect('/age-check')
  }

  if (user) {
    const [{ data: profileData }, { data: convData }, mem, demographics] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('conversations')
        .select('id, title, category, updated_at, messages')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(5),
      getMemory(user.id),
      getDemographics(supabase, user.id),
    ])
    profile = profileData
    conversations = convData
    memory = mem
    promptGender = toPromptGender(demographics.gender)
  }

  // Dynamic prompts — VN time UTC+7, shuffled fresh on each server render
  const nowMs = Date.now()
  const vnTime = new Date(nowMs + 7 * 60 * 60 * 1000)
  // 5, not the default 4: the approved Home reference shows five cards across the
  // "Suggested for you" row. This is a DISPLAY COUNT, not new content — the extra prompt is
  // drawn from the same real pool by the same generator, and nothing here fabricates a
  // suggestion to fill the row. `promptGender` comes from the canonical
  // `user_demographics` row (main #251), no longer from `user_metadata`.
  const SUGGESTIONS = getDynamicPrompts(vnTime.getUTCHours(), vnTime.getUTCDay(), memory, promptGender, 5)

  // The hero greeting is a function of the Vietnam clock — the same server-computed
  // instant the prompts use — resolved by `heroGreeting` (src/lib/home/heroGreeting.ts),
  // the one copy of the rules Android mirrors. Only the clock facts travel to the client;
  // the language is the client's, so switching locale re-picks from the same slot.
  const hero = vietnamHeroClock(nowMs)

  const userInfo = user
    ? {
        full_name: profile?.full_name ?? user.user_metadata?.full_name,
        avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url,
        email: user.email,
      }
    : undefined

  // No Vietnamese fallback here: the name is rendered inside a localized greeting, so a hardcoded
  // 'bạn' produced "Hi, bạn 👋" for English sessions. HomeView supplies the fallback word (B07).
  const firstName = userInfo?.full_name?.split(' ').pop() || userInfo?.email?.split('@')[0] || ''

  const convList = (conversations ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    messageCount: Array.isArray(c.messages) ? c.messages.length : 0,
    updated_at: c.updated_at,
  }))

  return (
    <>
      {/* G1 GEO: WebSite (SearchAction → /chat?q=) + Organization. Static data, no user fields. */}
      {siteJsonLd().map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      ))}
      <HomeV3
        user={!!user}
        userInfo={userInfo}
        firstName={firstName}
        suggestions={SUGGESTIONS}
        conversations={convList}
        hero={hero}
      />
    </>
  )
}
