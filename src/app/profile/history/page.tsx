import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HistoryView from './HistoryView'

// ── V3 Web · History ────────────────────────────────────────────────────────
//
// 🚨 EVERY CATEGORY ON THIS PAGE IS READ FROM A TABLE THE USER ALREADY OWNS.
// No new table, no new API, no new write path. The reference design drew six
// modules; five of them exist:
//
//   Đã hỏi AI        `conversations`         (this page already read it)
//   Đã xem video     `review_interactions`   owner-scoped watch records
//   Đã kiểm tra link `tappy_scam_history`    device-local, read in the client
//   Đã đặt lịch      `bookings`              the same rows `/profile/bookings` lists
//   Kế hoạch         derived by the Planner from `conversations`
//
// 🚨 AND THE SIXTH — "Tìm kiếm gần đây" — IS NOT BUILT. Nothing in this product
// stores a search: there is no `search_history` table, no recent-search key in
// any client store, and no endpoint that records a query. A tab labelled with it
// would have to invent its own contents.
//
// 🚨 `user_events` IS NOT USED HERE, DELIBERATELY. It exists, it is owner-scoped,
// and it is full of rows — `chat_search`, `hide`, `not_interested`. It is
// ANALYTICS. Rendering "Bạn đã ẩn một bài viết" out of a telemetry row invents a
// user-facing event vocabulary that this product has never defined, and turns
// signals collected for ranking into a diary the user never asked for.

/** Matches the Planner's own window over `conversations`. */
const CONVERSATION_LIMIT = 50
/** One row per review the user has watched; the newest are the ones worth listing. */
const WATCH_LIMIT = 50
/** Bookings are rare; the newest few are what a history page lists, the rest live at /profile/bookings. */
const BOOKING_LIMIT = 20

interface WatchRow {
  review_id: string
  created_at: string
  watch_seconds: number | null
}

interface ReviewRow {
  id: string
  place_name: string | null
  thumbnail: string | null
  content_type: string | null
}

interface BookingRow {
  id: string
  service_name: string | null
  status: string | null
  date: string | null
  time: string | null
  created_at: string
}

export default async function ProfileHistoryPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?returnTo=/profile/history')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()

  // 🔑 Both reads are owner-scoped TWICE: by the `.eq('user_id', …)` below and by
  // the RLS policies on each table (`conversations.user_id = auth.uid()`,
  // `review_interactions` "Users manage own interactions"). History is private
  // data and the filter is not left to one layer.
  const [convRes, watchRes, bookingRes] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, title, category, updated_at, messages')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(CONVERSATION_LIMIT),
    supabase
      .from('review_interactions')
      .select('review_id, created_at, watch_seconds')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(WATCH_LIMIT),
    // The bookings page reads `*`; History needs the identity fields only — no
    // customer name or phone crosses to this client.
    supabase
      .from('bookings')
      .select('id, service_name, status, date, time, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(BOOKING_LIMIT),
  ])

  const watches = (watchRes.data ?? []) as WatchRow[]

  /**
   * The watched reviews themselves, fetched separately.
   *
   * 🚨 NO `is_hidden` / publication filter is applied, and that is correct here:
   * this is the user's OWN watch history, not a public feed. What it must not do
   * is invent a row for a review that has since been deleted — so a missing
   * review drops the entry rather than rendering a card with a blank title.
   */
  let reviewsById = new Map<string, ReviewRow>()
  if (watches.length > 0) {
    const { data: reviews } = await supabase
      .from('reviews')
      .select('id, place_name, thumbnail, content_type')
      .in('id', watches.map(w => w.review_id))
    reviewsById = new Map(((reviews ?? []) as ReviewRow[]).map(r => [r.id, r]))
  }

  const userInfo = {
    full_name: profile?.full_name ?? user.user_metadata?.full_name,
    avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url,
    email: user.email,
  }

  return (
    <HistoryView
      userInfo={userInfo}
      conversations={(convRes.data ?? []).map(c => ({
        id: c.id as string,
        title: (c.title as string) ?? '',
        category: (c.category as string) ?? 'general',
        updated_at: c.updated_at as string,
        // Counted here so the `messages` blob never crosses to the client — the
        // page needs a number, not a transcript.
        messageCount: Array.isArray(c.messages) ? c.messages.length : 0,
      }))}
      videos={watches
        .map(w => {
          const review = reviewsById.get(w.review_id)
          if (!review) return null
          return {
            reviewId: w.review_id,
            title: review.place_name ?? '',
            thumbnail: review.thumbnail,
            contentType: review.content_type,
            watchedAt: w.created_at,
          }
        })
        .filter((v): v is NonNullable<typeof v> => v !== null)}
      bookings={((bookingRes.data ?? []) as BookingRow[]).map(b => ({
        id: b.id,
        serviceName: b.service_name ?? '',
        status: b.status ?? 'pending',
        date: b.date,
        time: b.time,
        createdAt: b.created_at,
      }))}
    />
  )
}
