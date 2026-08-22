import { createClient } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { publishableFilter } from '@/lib/safety/gate/publicationAccess'
import { authorModerationPayload } from '@/lib/safety/gate/authorNotice'
import { decidePublication } from '@/lib/safety/gate/publishDecision'
import { stripUnservableMedia } from '@/lib/media/servableMedia'
import { NextRequest, NextResponse } from 'next/server'
import { rebuildProfile } from '@/lib/preferences/profileCache'
import { createSelection, getTrack, recordUsage, createOriginalSound } from '@/modules/music/server'
import { dailyRateLimit, clientIp } from '@/lib/security/rateLimit'
import { isAcceptableVideoDuration, MAX_VIDEO_DURATION_ACCEPT_SEC } from '@/lib/config/product'
import { searchParam } from '@/lib/http/searchParams'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'

const MUSIC_PAYLOAD_VERSION = 1

interface ReviewMusic {
  version: number
  trackId: string
  startSec: number
  volume: number
  // 'original' = this clip's own audio, auto-registered as a reusable sound.
  // 'attached' = a sound borrowed from another clip / the music library.
  // The feed uses this to decide playback: original clips play their own video
  // audio; attached clips mute the video and play the borrowed sound over it.
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

  let placeId: string, placeName: string, placeAddress: string, rating: number, body: string, photos: string[]
  let media_url: string, thumbnail: string, content_type: string, source_type: string, source_url: string, hashtags: string[]
  let music: ReviewMusic | null
  let videoDuration = 0
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
    music = null
    if (b.music) {
      if (b.music.version !== MUSIC_PAYLOAD_VERSION) throw new Error('unsupported music version')
      // createSelection validates shape (trackId non-empty, startSec/volume in range)
      // and throws on invalid input — reuses the Music Module's own public validator
      // rather than re-implementing the checks here.
      const selection = createSelection(String(b.music.trackId), Number(b.music.startSec), Number(b.music.volume))
      // A track the user picked from another clip / the library → 'attached':
      // the feed mutes this clip's video and plays the borrowed sound over it.
      music = { version: MUSIC_PAYLOAD_VERSION, ...selection, origin: 'attached' }
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

  if (music) {
    const track = await getTrack(music.trackId)
    if (!track) {
      return NextResponse.json({ error: 'track_gone', message: serverMessage('music.trackGone', requestLocale(req)) }, { status: 400 })
    }
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

  // Auto-register the clip's OWN audio as a reusable "original sound" (TikTok
  // model): a native video upload that didn't borrow a sound gets an
  // original_sound track pointing at the clip itself (Phase 1 — audio_url = the
  // video's media_url, no extraction). Others can then "use this sound", and the
  // clip shows up under it. Best-effort — a failure here never blocks the post.
  if (!music && content_type === 'video' && source_type === 'upload' && media_url) {
    try {
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
      const durationSec = Math.min(600, Math.max(1, Math.round(videoDuration) || 15))
      const trackId = await createOriginalSound(supabase, {
        title: 'Âm thanh gốc',
        artist: prof?.full_name?.trim() || null,
        durationSec,
        audioUrl: media_url,
        coverUrl: thumbnail || null,
        uploadedBy: user.id,
      })
      if (trackId) music = { version: MUSIC_PAYLOAD_VERSION, trackId, startSec: 0, volume: 1, origin: 'original' }
    } catch (e) { console.error('[reviews] original sound registration failed:', e instanceof Error ? e.message : e) }
  }

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

  // If music column doesn't exist yet, retry without it
  if (insertError && music && insertError.message?.includes('music')) {
    console.warn('music column missing, retrying without music:', insertError.message)
    const dataNoMusic = { ...reviewData }
    delete dataNoMusic.music
    const { error: retryError3 } = await supabase.from('reviews').insert(dataNoMusic)
    insertError = retryError3 ?? null
  }

  if (insertError) {
    // Log concise detail server-side for debugging; never leak DB error text to the client.
    console.error('Review insert error:', insertError.code ?? insertError.message)
    return NextResponse.json({ error: 'save_failed', message: serverMessage('review.saveFailed', requestLocale(req)) }, { status: 500 })
  }

  // Record music usage for the "sound page" virality loop (how many videos use
  // a track, and which ones). Append-only history — best-effort, never blocks
  // or fails the post. entity_type 'review' is this feature's own convention.
  if (music) {
    let reviewId = insData?.id as string | undefined
    if (!reviewId) {
      // A column-mismatch retry above may have re-inserted without returning id.
      const { data: found } = await supabase
        .from('reviews').select('id').eq('user_id', user.id).eq('place_id', placeId).maybeSingle()
      reviewId = found?.id
    }
    if (reviewId) {
      recordUsage(supabase, { trackId: music.trackId, entityType: 'review', entityId: reviewId, userId: user.id }).catch(() => {})
    }
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
