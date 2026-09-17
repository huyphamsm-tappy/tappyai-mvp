import { resolveFirstName } from '@/lib/i18n/displayName'
import { createClient } from '@/lib/supabase/server'
import GuestProfileView from './GuestProfileView'
import ProfileView from './ProfileView'

// ── V3 Web · Profile / Me ───────────────────────────────────────────────────
//
// 🚨 EVERY NUMBER THIS PAGE SENDS IS READ OR COUNTED FROM THE USER'S OWN ROWS.
//
// The design reference shows a personal hub carrying a cover photo, an @handle, a location, a
// points balance with a progress bar to a "Silver" tier, seven achievement rows and a friends
// list. Audited against the schema, four of those have NO column, NO table and NO API anywhere
// in this product — see the omission notes in `ProfileView`. What is real is fetched here:
//
//   • `profiles.bio`                         — added by `add_profile_edit.sql`
//   • `profiles.follower_count` / `following_count` — real columns, kept in sync by the
//     `update_follow_counts` triggers in `add_social_week2.sql`
//   • `profiles.created_at`                  — the join date
//   • `subscriptions.status`                 — the ONLY thing that may light a Premium badge
//   • counts over the user's own `reviews`, `review_saves`, `favorites`, `conversations`
//   • the profiles this user follows, via `user_follows`
//
// 🚨 THE AGGREGATES ARE COUNTS, NOT CONTENT. `like_count` and `content_type` are selected to be
// summed and then discarded; no review body, photo or media URL is read here. Post CONTENT is
// fetched by the client from `/api/reviews/mine`, `/api/reviews/saved` and `/api/favorites`,
// which is deliberate: those routes carry the publication/safety gate and `stripUnservableMedia`,
// and a direct read here would render held posts and unservable media that the gate exists to
// withhold. Reusing them is not a convenience, it is the correctness boundary.

/** How many follows the sidebar card shows. The card links onward rather than paginating. */
const FOLLOWING_PREVIEW = 5

export default async function ProfilePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Anonymous visitors get the guest screen instead of a redirect to /login:
  // "Me" is a primary nav tab, and ejecting guests there made the whole app
  // look sign-in-walled. Purely presentational — every linked destination keeps
  // its own server-side auth check, and no profile data is fetched here.
  if (!user) return <GuestProfileView />

  const [
    { data: profile },
    { count: conversationCount },
    { data: subscription },
    { data: ownReviews },
    { count: savedReviewCount },
    { count: favoriteCount },
    { data: followRows },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('subscriptions').select('status').eq('user_id', user.id).maybeSingle(),
    // Counts only — see the note above. `like_count` is the denormalized column the
    // `update_review_like_count` trigger maintains, so this is the same number the post shows.
    supabase.from('reviews').select('content_type, like_count').eq('user_id', user.id),
    supabase.from('review_saves').select('review_id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('favorites').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('user_follows').select('following_id').eq('follower_id', user.id).limit(FOLLOWING_PREVIEW),
  ])

  // The people this user follows. `user_follows` is DIRECTIONAL — a row means "I follow them",
  // never "we are friends" — so the card is labelled Following, not Bạn bè, and no mutuality is
  // computed or implied. A second query rather than a join, because PostgREST cannot embed
  // `profiles` through `user_follows` without a declared FK relationship.
  const followingIds = (followRows ?? []).map((r) => r.following_id as string)
  const { data: followingProfiles } = followingIds.length
    ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', followingIds)
    : { data: [] as { id: string; full_name: string | null; avatar_url: string | null }[] }

  const reviews = ownReviews ?? []
  const stats = {
    posts: reviews.length,
    videos: reviews.filter((r) => r.content_type === 'video').length,
    // Likes RECEIVED on the user's own posts — the sum of a column the database maintains,
    // not a number invented for the hero.
    likes: reviews.reduce((sum, r) => sum + (typeof r.like_count === 'number' ? r.like_count : 0), 0),
    savedReviews: savedReviewCount ?? 0,
    savedPlaces: favoriteCount ?? 0,
    conversations: conversationCount ?? 0,
  }

  const userInfo = {
    full_name: profile?.full_name || user.user_metadata?.full_name,
    avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url,
    email: profile?.email || user.email,
  }
  // C14 — no fallback here: this is a server component and cannot know the language.
  // ProfileView applies the localized fallback.
  const firstName = resolveFirstName(userInfo)

  return (
    <ProfileView
      userId={user.id}
      userInfo={userInfo}
      firstName={firstName}
      conversationCount={conversationCount || 0}
      bio={profile?.bio ?? null}
      // `profiles.cover_url` — `20260915_profile_public_presentation.sql`. `select('*')` above
      // means this is simply absent (null) until the column exists; the hero then stays a gradient.
      coverUrl={typeof profile?.cover_url === 'string' && profile.cover_url ? profile.cover_url : null}
      joinedAt={profile?.created_at ?? null}
      followerCount={typeof profile?.follower_count === 'number' ? profile.follower_count : null}
      followingCount={typeof profile?.following_count === 'number' ? profile.following_count : null}
      // 🚨 The badge lights ONLY on a real active subscription. `SHOW_PRO_UPGRADE` is false during
      // the free test phase, so in practice this is null for everyone — which is the honest render,
      // not a reason to hardcode "Premium" the way the reference shows it.
      isPremium={subscription?.status === 'active'}
      stats={stats}
      following={(followingProfiles ?? []).map((p) => ({
        id: p.id,
        name: p.full_name,
        avatarUrl: p.avatar_url,
      }))}
    />
  )
}
