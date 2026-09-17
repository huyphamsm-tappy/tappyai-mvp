import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { getMediaProvider, putMedia, randomMediaSuffix } from '@/lib/media'
import { sniffImageType, imageExt, imageMime } from '@/lib/security/imageType'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { MAX_PHOTO_SIZE_MB } from '@/lib/config/product'

// ── One profile row, every reader ────────────────────────────────────────────
//
// `profiles` is the single identity record behind Profile/Me (`/profile`), the
// edit form (`/profile/edit`) and the Explore public profile (`/users/[id]`).
// `bio` and `cover_url` are the public presentation fields added by
// `20260915_profile_public_presentation.sql`.
//
// 🔑 Schema bridge: until that migration is applied the two columns do not
// exist and PostgREST answers 42703. Reads then fall back to the previous
// column set and the bio comes from auth metadata (where the form has been
// saving it); writes retry without the column. The response carries
// `cover_url` ONLY when the column exists — that key's presence is what lets
// the clients show the cover control. Remove the fallbacks once applied.
const OWN_COLUMNS = 'full_name, avatar_url, created_at, language, onboarded'
const PRESENTATION_COLUMNS = ', bio, cover_url'
const UNDEFINED_COLUMN = '42703'

type OwnProfileRow = {
  full_name?: string | null; avatar_url?: string | null; created_at?: string | null
  language?: string | null; onboarded?: boolean | null; bio?: string | null; cover_url?: string | null
}

async function readOwnProfile(supabase: Awaited<ReturnType<typeof getRequestUser>>['supabase'], userId: string): Promise<{ profile: OwnProfileRow | null; presentation: boolean }> {
  const first = await supabase.from('profiles').select(OWN_COLUMNS + PRESENTATION_COLUMNS).eq('id', userId).single()
  if (first.error?.code !== UNDEFINED_COLUMN) return { profile: (first.data as OwnProfileRow | null) ?? null, presentation: true }
  const second = await supabase.from('profiles').select(OWN_COLUMNS).eq('id', userId).single()
  return { profile: (second.data as OwnProfileRow | null) ?? null, presentation: false }
}

// GET /api/profile
export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  const { profile, presentation } = await readOwnProfile(supabase, user.id)

  return NextResponse.json({
    full_name: profile?.full_name || user.user_metadata?.full_name || '',
    avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || '',
    // Email is sourced from the session (auth.users.email), never from
    // profiles — the duplicate profiles.email column is being removed
    // (add_profiles_email_isolation.sql) to close a public-read exposure.
    email: user.email || '',
    // The profile row is the source of truth; auth metadata is where the bio
    // lived before the column existed, and still holds the last value a user
    // saved before the migration — shown until they save again.
    bio: profile?.bio || user.user_metadata?.bio || '',
    ...(presentation ? { cover_url: profile?.cover_url || null } : {}),
    // UI language only (Localization_Architecture.md §2.3) — AI response
    // language is never read from here, it stays per-message auto-detected.
    language: profile?.language || null,
    // Whether the user has finished the onboarding wizard. The web reads this
    // column directly via Supabase in its auth-callback redirect gate; native
    // clients (no direct Postgrest access) read it here to make the same
    // "route new users to onboarding" decision. Existing (public-safe) column.
    onboarded: profile?.onboarded ?? false,
  })
}

// PATCH /api/profile — update name, bio, and UI language
export async function PATCH(req: NextRequest) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* empty body is OK */ }

    const full_name = typeof body.full_name === 'string' ? body.full_name.trim().slice(0, 100) : undefined
    const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 200) : undefined
    const language = body.language === 'vi' || body.language === 'en' ? body.language : undefined
    // The cover can only be CLEARED here. Its value is set by the upload below, from an
    // object this server wrote — a client-supplied URL would let anyone hang any image
    // on their public profile.
    const clearCover = body.cover_url === null

    // Update profiles table — the one row every profile surface reads.
    if (full_name !== undefined || language !== undefined || bio !== undefined || clearCover) {
      const updates: Record<string, string | null> = {}
      if (full_name !== undefined) updates.full_name = full_name
      if (language !== undefined) updates.language = language
      if (bio !== undefined) updates.bio = bio
      if (clearCover) updates.cover_url = null
      let { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
      // Schema bridge (see the top of the file): before the migration, `bio` is not a column.
      // Retry without it — the metadata write below still keeps the value — but a cover
      // reset has no fallback, since there is no cover without the column either.
      if (error?.code === UNDEFINED_COLUMN && bio !== undefined && !clearCover) {
        delete updates.bio
        if (Object.keys(updates).length > 0) {
          ;({ error } = await supabase.from('profiles').update(updates).eq('id', user.id))
        } else {
          error = null
        }
      }
      // W2/C44 — never hand a Postgres error to the client: it carries table and column names.
      // Log the detail, return a code the client can branch on plus a sentence a user can read.
      if (error) {
        console.error('[profile] update failed:', error.code ?? error.message)
        return NextResponse.json({ error: 'save_failed', message: serverMessage('server.saveFailed', requestLocale(req)) }, { status: 500 })
      }
    }

    // Save bio + name to auth metadata too — the readers that predate the column
    const metaUpdates: Record<string, string> = {}
    if (full_name !== undefined) metaUpdates.full_name = full_name
    if (bio !== undefined) metaUpdates.bio = bio

    if (Object.keys(metaUpdates).length > 0) {
      await supabase.auth.updateUser({ data: metaUpdates })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[profile] PATCH failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 })
  }
}

// ── Cover upload ─────────────────────────────────────────────────────────────
//
// Declared ABOVE the avatar handler on purpose: U02 (`anonymousWriteBoundary.test.ts`)
// reads a guarded route top-down and requires the anonymous refusal to precede every
// `.upsert(`. The avatar path stays exempt (an anonymous row is the visitor's own,
// claimed on sign-in — see the exemption list); the cover path is guarded.
//
// Owner-only by construction: the row updated is `id = user.id` from the verified
// session, and RLS (`profiles_update`: id = auth.uid()) says the same. `update`,
// not `upsert`: an anonymous session has no profile row (handle_new_user skips
// it) and must not get one here — and it is refused up front regardless, since a
// public cover is a social write (B17).
const COVER_MAX_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024

async function uploadCover(
  req: NextRequest,
  user: NonNullable<Awaited<ReturnType<typeof getRequestUser>>['user']>,
  supabase: Awaited<ReturnType<typeof getRequestUser>>['supabase'],
  file: File,
) {
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  if (file.size > COVER_MAX_BYTES) {
    return NextResponse.json({ error: 'image_too_large', message: serverMessage('media.imageTooLarge5', requestLocale(req)) }, { status: 400 })
  }
  // Magic bytes, never the declared type — same rule as the avatar and review photos.
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffImageType(bytes)
  if (!kind) {
    return NextResponse.json({ error: 'bad_image_type', message: serverMessage('media.imageType', requestLocale(req)) }, { status: 400 })
  }

  let blob: { url: string }
  try {
    blob = await putMedia(
      `covers/${user.id}-${randomMediaSuffix()}.${imageExt(kind)}`,
      file,
      { contentType: imageMime(kind) },
      getMediaProvider(process.env, req)
    )
  } catch (e) {
    console.error('[profile] cover upload failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'upload_failed', message: serverMessage('media.uploadFailed', requestLocale(req)) }, { status: 500 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ cover_url: blob.url })
    .eq('id', user.id)

  if (error) {
    // Before `20260915_profile_public_presentation.sql` is applied there is nowhere to
    // record the cover; the clients do not offer the control until the column exists,
    // so reaching this is a direct call, not a user path.
    console.error('[profile] cover save failed:', error.code ?? error.message)
    return NextResponse.json({ error: 'save_failed', message: serverMessage('server.saveFailed', requestLocale(req)) }, { status: 500 })
  }

  return NextResponse.json({ cover_url: blob.url })
}

// POST /api/profile — upload avatar (`avatar` field) or profile cover (`cover` field)
export async function POST(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 }) }

  // The cover is a public-profile presentation: same validation, same media
  // bridge and the same magic-byte check as the avatar, under its own prefix
  // and with the photo limit the composer already enforces for review photos.
  const cover = formData.get('cover')
  if (cover instanceof File) return uploadCover(req, user, supabase, cover)

  const file = formData.get('avatar') as File | null
  if (!file) return NextResponse.json({ error: 'no_file', message: serverMessage('media.noFile', requestLocale(req)) }, { status: 400 })

  if (file.size > 3 * 1024 * 1024) {
    return NextResponse.json({ error: 'image_too_large', message: serverMessage('media.imageTooLarge3', requestLocale(req)) }, { status: 400 })
  }
  // Validate by magic bytes, not the client-declared MIME/extension — blocks
  // SVG/HTML-as-avatar (stored-XSS) and mislabeled uploads.
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffImageType(bytes)
  if (!kind) {
    return NextResponse.json({ error: 'bad_image_type', message: serverMessage('media.imageType', requestLocale(req)) }, { status: 400 })
  }

  let blob: { url: string }
  try {
    // `addRandomSuffix` was a Vercel Blob feature; the bridge is provider
    // agnostic, so the cache-busting suffix is now explicit. Same effect:
    // every avatar upload is a new object, so caches never serve a stale one.
    blob = await putMedia(
      `avatars/${user.id}-${randomMediaSuffix()}.${imageExt(kind)}`,
      file,
      { contentType: imageMime(kind) },
      // `req` carries the deployment's OIDC token in production — without it a
      // GCS write has no identity to federate with.
      getMediaProvider(process.env, req)
    )
  } catch (e) {
    console.error('[profile] avatar upload failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'upload_failed', message: serverMessage('media.uploadFailed', requestLocale(req)) }, { status: 500 })
  }

  // Upsert avatar_url (creates row if not exists, updates if exists)
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, avatar_url: blob.url }, { onConflict: 'id' })

  if (error) {
    console.error('[profile] avatar upsert failed:', error.code ?? error.message)
    return NextResponse.json({ error: 'save_failed', message: serverMessage('server.saveFailed', requestLocale(req)) }, { status: 500 })
  }

  // Also save to auth metadata
  await supabase.auth.updateUser({ data: { avatar_url: blob.url } })

  return NextResponse.json({ avatar_url: blob.url })
}

