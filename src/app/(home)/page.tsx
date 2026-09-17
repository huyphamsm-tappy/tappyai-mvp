import { createClient } from '@/lib/supabase/server'
import { getDynamicPrompts } from '@/lib/suggestedPrompts'
import { getMemory } from '@/lib/memory/memoryService'
// V3 Web redesign — the Home surface is now the V3 panel grid. `HomeView` (the
// pre-V3 single-column composition) is retained in the tree unreferenced so the
// old layout stays available for comparison during the visual review gate.
import HomeV3 from '../HomeV3'
import { vietnamHeroClock } from '@/lib/home/heroGreeting'

export default async function HomePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  let conversations: { id: string; title: string; category: string; updated_at: string; messages: unknown }[] | null = null
  let memory = null

  if (user) {
    const [{ data: profileData }, { data: convData }, mem] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('conversations')
        .select('id, title, category, updated_at, messages')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(5),
      getMemory(user.id),
    ])
    profile = profileData
    conversations = convData
    memory = mem
  }

  // Dynamic prompts — VN time UTC+7, shuffled fresh on each server render
  const nowMs = Date.now()
  const vnTime = new Date(nowMs + 7 * 60 * 60 * 1000)
  const gender = user?.user_metadata?.gender === 'male' ? 'male' : user?.user_metadata?.gender === 'female' ? 'female' : null
  // 5, not the default 4: the approved Home reference shows five cards across the
  // "Suggested for you" row. This is a DISPLAY COUNT, not new content — the extra prompt is
  // drawn from the same real pool by the same generator, and nothing here fabricates a
  // suggestion to fill the row.
  const SUGGESTIONS = getDynamicPrompts(vnTime.getUTCHours(), vnTime.getUTCDay(), memory, gender, 5)

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
    <HomeV3
      user={!!user}
      userInfo={userInfo}
      firstName={firstName}
      suggestions={SUGGESTIONS}
      conversations={convList}
      hero={hero}
    />
  )
}
