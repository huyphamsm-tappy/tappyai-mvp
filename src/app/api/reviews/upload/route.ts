import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { getMediaProvider, putMedia } from '@/lib/media'
import { randomMediaSuffix } from '@/lib/media/key'
import { sniffImageType, imageExt, imageMime } from '@/lib/security/imageType'
import { stripImageMetadata } from '@/lib/media/stripImageMetadata'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { MAX_PHOTO_SIZE_MB } from '@/lib/config/product'
import { refuseIneligible } from '@/lib/account/requireEligibleUser'

// SQL required in Supabase:
// ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS photos text[] DEFAULT '{}';

// Shared with the composer, which shows this number to the user — see the note in product.ts.
const MAX_FILE_SIZE = MAX_PHOTO_SIZE_MB * 1024 * 1024
const MAX_UPLOADS_PER_DAY = 10

const rlStore = new Map<string, { date: string; count: number }>()
function checkRL(userId: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  const e = rlStore.get(userId)
  if (!e || e.date !== today) { rlStore.set(userId, { date: today, count: 1 }); return true }
  if (e.count >= MAX_UPLOADS_PER_DAY) return false
  e.count++
  return true
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('media.signInToUpload', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  // V3 User Data Foundation - review media is user-generated product content,
  // so it is 18+. Same canonical decision as POST /api/reviews itself
  // (`getAgeEligibility` via `refuseIneligible`), never a second copy of the rule.
  //
  // POSITION IS THE POINT. This sits before the rate-limit counter, before the
  // body is read and - decisively - before `putMedia`. The composers upload
  // photos FIRST and post the review afterwards, so gating only the post left an
  // ineligible account able to write media into storage and be refused one call
  // later, leaving the object behind with nothing referencing it. Refusing here
  // writes nothing at all, and costs the user none of their daily quota.
  const ageRefusal = await refuseIneligible(req, supabase)
  if (ageRefusal) return ageRefusal

  if (!checkRL(user.id)) {
    return NextResponse.json(
      { error: 'rate_limit', message: serverMessage('rate.uploadLimit', requestLocale(req), { n: MAX_UPLOADS_PER_DAY }) },
      { status: 429 }
    )
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file_not_found', message: serverMessage('media.fileNotFound', requestLocale(req)) }, { status: 400 })
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'image_too_large', message: serverMessage('media.imageTooLarge', requestLocale(req), { n: String(MAX_PHOTO_SIZE_MB) }) }, { status: 400 })

  // Validate the REAL file type by its magic bytes, not the client-supplied
  // MIME/extension — blocks SVG/HTML-as-image (stored-XSS) and mislabeled files.
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffImageType(bytes)
  if (!kind) return NextResponse.json({ error: 'bad_image_type', message: serverMessage('media.imageType', requestLocale(req)) }, { status: 400 })

  // R-2: strip EXIF/XMP before anything is stored. A camera-roll JPEG carries GPS to a few
  // metres, and these objects are served publicly. `.rotate()` inside bakes the orientation tag
  // into the pixels first, so the photo still looks upright once the tag is gone. A payload that
  // passed the signature check but cannot be decoded is refused rather than stored untouched.
  let clean: Buffer
  try {
    clean = (await stripImageMetadata(bytes, kind)).bytes
  } catch (e) {
    console.error('[reviews/upload] metadata strip failed, refusing upload:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'bad_image_type', message: serverMessage('media.imageType', requestLocale(req)) }, { status: 400 })
  }

  try {
    // Owner decision 2026-09-26: the same 24-char random suffix every other upload path uses. A bare
    // `Date.now()` was guessable from the (public) user id and the rough upload time; the bucket is
    // publicly readable by URL. The timestamp stays in front only for ordering in a listing.
    const path = `reviews/${user.id}/${Date.now()}-${randomMediaSuffix()}.${imageExt(kind)}`
    // `req` carries the deployment's OIDC token in production — without it a
    // GCS write has no identity to federate with.
    const blob = await putMedia(
      path,
      clean,
      { contentType: imageMime(kind) },
      getMediaProvider(process.env, req)
    )
    return NextResponse.json({ url: blob.url })
  } catch (e) {
    console.error('Media upload error:', e)
    return NextResponse.json({ error: 'upload_failed', message: serverMessage('media.uploadFailed', requestLocale(req)) }, { status: 500 })
  }
}
