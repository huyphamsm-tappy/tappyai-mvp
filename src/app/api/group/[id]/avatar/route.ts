import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { getMediaProvider, putMedia, randomMediaSuffix } from '@/lib/media'
import { sniffImageType, imageExt, imageMime } from '@/lib/security/imageType'

/** Same ceiling as a profile avatar (`POST /api/profile`). */
const MAX_AVATAR_BYTES = 3 * 1024 * 1024

// POST /api/group/[id]/avatar — set the GROUP's picture (multipart field `avatar`).
//
// Phase 7 (item 4). This is the profile-avatar upload applied to a group, not a second
// pipeline: the same magic-byte sniff (blocks SVG/HTML-as-image), the same 3 MB cap, the
// same `putMedia` under the `avatars/` prefix, and the URL is stored on the group row.
//
// 🔑 Who may do it: the creator, and only the creator — the one "admin" the group model
// has. It is enforced twice, on purpose: an explicit check here (so a non-creator gets a
// 403 BEFORE any bytes are written to storage) and by RLS ("Creators manage own groups",
// auth.uid() = creator_id) on the UPDATE, so a future caller that skips this route still
// cannot set another creator's picture. The UPDATE runs as the caller, never as service
// role.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const groupId = params.id
  if (!groupId) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })

  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, creator_id')
    .eq('id', groupId)
    .single()
  if (groupError || !group) return NextResponse.json({ error: 'group_not_found', message: serverMessage('group.notFound', requestLocale(req)) }, { status: 404 })
  if (group.creator_id !== user.id) return NextResponse.json({ error: 'forbidden', message: serverMessage('auth.forbidden', requestLocale(req)) }, { status: 403 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 }) }

  const file = formData.get('avatar') as File | null
  if (!file) return NextResponse.json({ error: 'no_file', message: serverMessage('media.noFile', requestLocale(req)) }, { status: 400 })
  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: 'image_too_large', message: serverMessage('media.imageTooLarge3', requestLocale(req)) }, { status: 400 })
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffImageType(bytes)
  if (!kind) {
    return NextResponse.json({ error: 'bad_image_type', message: serverMessage('media.imageType', requestLocale(req)) }, { status: 400 })
  }

  let blob: { url: string }
  try {
    blob = await putMedia(
      `avatars/group-${groupId}-${randomMediaSuffix()}.${imageExt(kind)}`,
      file,
      { contentType: imageMime(kind) },
      getMediaProvider(process.env, req)
    )
  } catch (e) {
    console.error('[group/avatar] upload failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'upload_failed', message: serverMessage('media.uploadFailed', requestLocale(req)) }, { status: 500 })
  }

  // `.select()` so an UPDATE that RLS silently filtered to zero rows is a failure, not a
  // "saved" — a fake success here would show a picture that never persisted.
  const { data: updated, error } = await supabase
    .from('groups')
    .update({ avatar_url: blob.url })
    .eq('id', groupId)
    .eq('creator_id', user.id)
    .select('id')
  if (error || !updated || updated.length === 0) {
    console.error('[group/avatar] save failed:', error?.code ?? error?.message ?? 'no row updated')
    return NextResponse.json({ error: 'save_failed', message: serverMessage('server.saveFailed', requestLocale(req)) }, { status: 500 })
  }

  return NextResponse.json({ avatar_url: blob.url })
}
