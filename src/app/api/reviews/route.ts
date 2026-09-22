import { createClient } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { publishableFilter } from '@/lib/safety/gate/publicationAccess'
import { authorModerationPayload } from '@/lib/safety/gate/authorNotice'
import { decidePublication } from '@/lib/safety/gate/publishDecision'
import { stripUnservableMedia } from '@/lib/media/servableMedia'
import { NextRequest, NextResponse } from 'next/server'
import { rebuildProfile } from '@/lib/preferences/profileCache'
import { gone } from '@/lib/http/gone'
import { dailyRateLimit, clientIp } from '@/lib/security/rateLimit'
import { isAcceptableVideoDuration, MAX_VIDEO_DURATION_ACCEPT_SEC } from '@/lib/config/product'
import { searchParam } from '@/lib/http/searchParams'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { getAccountRestriction, accountRestrictionMessage, accountRestrictionCode } from '@/lib/account/accountStatus'
import { refuseIneligible } from '@/lib/account/requireEligibleUser'
import { getTrack } from '@/modules/music/server'

const MUSIC_PAYLOAD_VERSION = 1

interface ReviewMusic {
  version: number
  trackId: string
  startSec: number
  volume: number
  // 'attached' = a soundtrack picked from the Music LIBRARY: the feed mutes the clip's
  // own audio and plays the track over it. ('original' — a clip's own audio registered
  // as a reusable sound — is the retired reuse path and is never written any more.)
  origin?: 'original' | 'attached'
}

// Daily cap: 20 posts/day/IP via the shared limiter (lib/security/rateLimit) —
// one implementation for every daily-capped route instead of per-route Maps.
const DAILY_POST_LIMIT = 20

// GET /api/reviews?placeId=ChIJxxx  → list visible reviews for a place
export async function GET(req: NextRequest) {
  const placeId = searchParam(req, 'placeId')
  if (!placeId) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })

  const supabase = createClient()
  const { data, error } = await supabase
    .from('reviews')
    .select('id, user_id, place_name, rating, body, created_at, is_verified, like_count, photos, profiles(full_name, avatar_url)')
    .eq('place_id', placeId)
    .eq('is_hidden', false)
    // Content safety gate — never serve content the gate has not published.
    // Legacy rows (publication_state NULL) predate the gate and keep the exact
    // visibility they had before it existed.
    .or(publishableFilter())
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: 'load_failed', message: serverMessage('review.loadFailed', requestLocale(req)) }, { status: 500 })

  const avg = data && data.length > 0
    ? (() => { const rated = data.filter(r => r.rating > 0); return rated.length > 0 ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : null })()
    : null

  return NextResponse.json({
    // Same boundary rule as the feed — see stripUnservableMedia.
    reviews: (data || []).map(stripUnservableMedia),
    avg_rating: avg ? Math.round(avg * 10) / 10 : null,
    count: data?.length || 0,
  })
}

// POST /api/reviews  → create review (community — no booking required)
// If user has a past booking at this place, is_verified = true (badge)
export async function POST(req: NextRequest) {
  if (!dailyRateLimit(`reviews:${clientIp(req)}`, DAILY_POST_LIMIT).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.postLimit', requestLocale(req), { n: DAILY_POST_LIMIT }) }, { status: 429 })
  }

  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('review.signInToReview', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  // Module 08 §4 — a suspended account cannot post content. Checked before the
  // body is parsed and before any upload work, so a blocked post costs nothing.
  const restriction = await getAccountRestriction(supabase, user.id)
  if (restriction.blocked) {
    return NextResponse.json(
      { error: accountRestrictionMessage(restriction), code: accountRestrictionCode(restriction.reason!) },
      { status: 403 }
    )
  }

  // V3 User Data Foundation — posting content is product functionality, so it
  // is 18+. Same position as the suspension gate: before the body is parsed and
  // before any upload work, so a refused post costs nothing.
  const ageRefusal = await refuseIneligible(req, supabase)
  if (ageRefusal) return ageRefusal

  let placeId: string, placeName: string, placeAddress: string, rating: number, body: string, photos: string[]
  let media_url: string, thumbnail: string, content_type: string, source_type: string, source_url: string, hashtags: string[]
  let videoDuration = 0
  // A soundtrack from the Music LIBRARY (Phase 7). The client sends {trackId, startSec, volume};
  // only the id is trusted after the library check below. A clip's OWN audio is unaffected.
  let music: ReviewMusic | null = null
  try {
    const b = await req.json()
    placeId = b.placeId?.trim()
    placeName = b.placeName?.trim()
    placeAddress = b.placeAddress?.trim() || ''
    rating = Number(b.rating)
    body = b.body?.trim() || ''
    photos = Array.isArray(b.photos) ? b.photos.filter((u: unknown) => typeof u === 'string').slice(0, 6) : []
    media_url = b.media_url?.trim() || ''
    thumbnail = b.thumbnail?.trim() || ''
    content_type = b.content_type?.trim() || 'photo'
    source_type = b.source_type?.trim() || 'upload'
    source_url = b.source_url?.trim() || ''
    hashtags = Array.isArray(b.hashtags) ? b.hashtags.filter((t: unknown) => typeof t === 'string').slice(0, 10) : []
    videoDuration = Number(b.duration) || 0
    if (b.music) {
      const trackId = typeof b.music.trackId === 'string' ? b.music.trackId.trim() : ''
      if (!trackId) throw new Error('invalid music')
      const startSec = Math.max(0, Number(b.music.startSec) || 0)
      const volume = Math.min(1, Math.max(0, Number(b.music.volume) || 1))
      music = { version: MUSIC_PAYLOAD_VERSION, trackId, startSec, volume, origin: 'attached' }
    }
    if (!placeId || !placeName) throw new Error('missing fields')
    if (!body && photos.length === 0 && !media_url) throw new Error('need body or photos or media')
    if (rating && (rating < 1 || rating > 5 || !Number.isInteger(rating))) throw new Error('invalid rating')
    if (body.length > 1000) throw new Error('body too long')
  } catch {
    return NextResponse.json({ error: 'empty_post', message: serverMessage('review.contentRequired', requestLocale(req)) }, { status: 400 })
  }

  // Confirm the referenced track still exists (no DB-level FK to Music by
  // design — validated here via the Music Module's own public API). Sound model
  // (canonical, TikTok-style): EVERY Sound — licensed music, a clip's original
  // sound, or user-created — is reusable by reference; attaching only ever
  // stores the SoundID (trackId), never duplicates audio between videos.
  // The clients pre-validate duration for UX, but they are not the authority on what gets stored.
  // This is a bound on the SUBMITTED duration, not a measurement of the object — the server never
  // decodes the file, so a client could still under-report. Probing the object would mean a
  // transcoding pipeline, which is far more machinery than this rule is worth. A clip is only
  // rejected when the client itself declares a length past the ceiling; 0/absent stays allowed
  // because plenty of posts carry no video at all.
  if (videoDuration > 0 && !isAcceptableVideoDuration(videoDuration)) {
    return NextResponse.json(
      { error: 'video_too_long', message: serverMessage('media.videoTooLongSec', requestLocale(req), { n: MAX_VIDEO_DURATION_ACCEPT_SEC }) },
      { status: 400 }
    )
  }

  // 🚨 THE ONE PLACE THAT DECIDES WHAT A CLIP MAY ATTACH. `getTrack` is the Music Module's
  // server read and it returns ONLY library rows (`music_type` royalty_free / licensed,
  // active). A user's clip audio ("original sound"), a removed track or a made-up id all
  // resolve to null here and the post is refused with 410 — the same answer F-024 gave every
  // borrowed-sound attempt, because that is exactly what a non-library id is. The reuse path
  // (one user taking another user's clip audio) stays withdrawn; the licensed library is back.
  if (music) {
    const track = await getTrack(music.trackId)
    if (!track) return gone('music-reuse:attach-sound')
  }

  // Check if user has a past booking here → verified badge
  const today = new Date().toISOString().slice(0, 10)
  const { data: booking } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', user.id)
    .eq('place_id', placeId)
    .lt('date', today)
    .limit(1)
    .maybeSingle()

  const isVerified = !!booking

  // Check duplicate (1 review per user per place)
  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('user_id', user.id)
    .eq('place_id', placeId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'already_reviewed', message: serverMessage('review.alreadyReviewed', requestLocale(req)) }, { status: 409 })
  }

  // Music reuse is retired: a clip's audio is no longer auto-registered as a
  // reusable "original sound" (that only existed so others could "use this
  // sound", which is gone). A clip plays its OWN embedded audio unless the poster
  // picked a LIBRARY soundtrack above, in which case `reviewData.music` records
  // that choice by reference (never a copy of the audio).

  const reviewData: Record<string, unknown> = {
    user_id: user.id,
    place_id: placeId,
    place_name: placeName,
    place_address: placeAddress,
    body: body || '',
    is_verified: isVerified,
  }
  if (rating > 0) reviewData.rating = rating
  if (photos.length > 0) reviewData.photos = photos
  if (content_type && content_type !== 'photo') reviewData.content_type = content_type
  if (media_url) reviewData.media_url = media_url
  if (thumbnail) reviewData.thumbnail = thumbnail
  if (source_type && source_type !== 'upload') reviewData.source_type = source_type
  if (source_url) reviewData.source_url = source_url
  if (hashtags.length > 0) reviewData.hashtags = hashtags
  if (music) reviewData.music = music

  // ── Content safety publication gate ────────────────────────────────────────
  // The actual publication boundary. New content receives its lifecycle state
  // HERE, before it is stored, so nothing becomes public without a decision.
  //
  // While the gate is inactive this adds no columns at all, and the post is
  // stored exactly as it always was. When it is active, an evaluation that fails
  // yields UNDER_REVIEW — held, never restricted, and never an accusation.
  const { columns: lifecycle } = await decidePublication(
    {
      id: 'pending',
      body: reviewData.body,
      hashtags: reviewData.hashtags,
      place_name: reviewData.place_name,
      place_address: reviewData.place_address,
      content_type: reviewData.content_type,
      source_type: reviewData.source_type,
      media_url: reviewData.media_url,
      thumbnail: reviewData.thumbnail,
    },
    new Date().toISOString(),
  )
  Object.assign(reviewData, lifecycle)

  let { data: insData, error: insertError } = await supabase.from('reviews').insert(reviewData).select('id').maybeSingle()

  // If photos column doesn't exist yet, retry without it
  if (insertError && photos.length > 0 && insertError.message?.includes('photos')) {
    console.warn('photos column missing, retrying without photos:', insertError.message)
    const { error: retryError } = await supabase.from('reviews').insert({ ...reviewData, photos: undefined })
    insertError = retryError ?? null
  }

  // If rating check constraint fails, retry with rating omitted
  if (insertError && rating > 0 && (insertError.message?.includes('rating') || insertError.code === '23514')) {
    console.warn('rating constraint, retrying without rating:', insertError.message)
    const dataNoRating = { ...reviewData }
    delete dataNoRating.rating
    const { error: retryError2 } = await supabase.from('reviews').insert(dataNoRating)
    insertError = retryError2 ?? null
  }

  if (insertError) {
    // Log concise detail server-side for debugging; never leak DB error text to the client.
    console.error('Review insert error:', insertError.code ?? insertError.message)
    return NextResponse.json({ error: 'save_failed', message: serverMessage('review.saveFailed', requestLocale(req)) }, { status: 500 })
  }

  rebuildProfile(user.id, supabase).catch(() => {})

  // Tell the author what happened to their own post.
  //
  // Without this the gate is silent: the upload returns ok:true, the post is
  // held, and it never appears — which reads as the product losing the post.
  // `authorModerationPayload` returns null while the gate is inactive, so the
  // response shape is unchanged for anyone who has not turned the gate on.
  const lang =
    searchParam(req, 'lang') ||
    req.headers.get('accept-language')?.split(',')[0]?.trim() ||
    'vi'
  const moderation = authorModerationPayload(lifecycle, lang.toLowerCase().startsWith('en') ? 'en' : 'vi')

  return NextResponse.json({ ok: true, is_verified: isVerified, ...(moderation ? { moderation } : {}) })
}
