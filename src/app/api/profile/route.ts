import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { getMediaProvider, putMedia, randomMediaSuffix } from '@/lib/media'
import { sniffImageType, imageExt, imageMime } from '@/lib/security/imageType'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// GET /api/profile
export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, created_at, language, onboarded')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    full_name: profile?.full_name || user.user_metadata?.full_name || '',
    avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || '',
    // Email is sourced from the session (auth.users.email), never from
    // profiles — the duplicate profiles.email column is being removed
    // (add_profiles_email_isolation.sql) to close a public-read exposure.
    email: user.email || '',
    bio: user.user_metadata?.bio || '',
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

    // Update profiles table (only columns that definitely exist)
    if (full_name !== undefined || language !== undefined) {
      const updates: Record<string, string> = {}
      if (full_name !== undefined) updates.full_name = full_name
      if (language !== undefined) updates.language = language
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
      // W2/C44 — never hand a Postgres error to the client: it carries table and column names.
      // Log the detail, return a code the client can branch on plus a sentence a user can read.
      if (error) {
        console.error('[profile] update failed:', error.code ?? error.message)
        return NextResponse.json({ error: 'save_failed', message: serverMessage('server.saveFailed', requestLocale(req)) }, { status: 500 })
      }
    }

    // Save bio + name to auth metadata (no DB schema needed)
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

// POST /api/profile — upload avatar
export async function POST(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 }) }

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
