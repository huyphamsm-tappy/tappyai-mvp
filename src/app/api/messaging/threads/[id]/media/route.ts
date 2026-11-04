import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'
import { sniffImageType, imageMime } from '@/lib/security/imageType'
import { stripImageMetadata } from '@/lib/media/stripImageMetadata'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { CHAT_MEDIA_BUCKET, CHAT_MEDIA_KINDS, CHAT_MEDIA_MAX_BYTES, chatMediaPath } from '@/lib/messaging/media'

/**
 * POST /api/messaging/threads/[id]/media — upload ONE picture for a message of this conversation (migration 20261109_chat_media.sql).
 *
 * The server is the only writer of the private `chat-media` bucket (no client key can write it). In order: the session; not anonymous; a per-minute limit; the thread
 * (read with the CALLER's client, so row-level security answers — a thread they are not in is a 404, and that is decided BEFORE the file is read); the size; the REAL type
 * by its magic bytes (JPEG, PNG, WebP — a GIF cannot be re-encoded without risk, SVG/HTML are never pictures); the metadata (EXIF, GPS) removed by re-encoding BEFORE anything
 * is stored; then the object goes under "<thread>/<caller>/<random file>". The answer is the path (and the picture's size). A picture is attached to a conversation only by
 * the message that carries that path (POST .../messages), and the database refuses a path that is not under its own thread and sender.
 *
 * Not decided here: a picture uploaded and never sent stays in the bucket until a clean-up job (not written yet) removes it; a block between the participants is enforced
 * when the MESSAGE is sent (row-level security), not at upload.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const locale = requestLocale(req)
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  if (!rateLimit(`messaging:media:${user.id}`, 10, 60_000).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.tooFast', locale) }, { status: 429 })
  }

  // The thread, through the caller's own client: a non-participant gets nothing back — a 404, never a 403 (no oracle for "this thread exists").
  const { data: thread } = await supabase.from('chat_threads').select('id, kind').eq('id', params.id).maybeSingle()
  if (!thread) return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', locale) }, { status: 404 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', locale) }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'file_not_found', message: serverMessage('media.fileNotFound', locale) }, { status: 400 })
  if (file.size > CHAT_MEDIA_MAX_BYTES) {
    return NextResponse.json({ error: 'image_too_large', message: serverMessage('media.imageTooLarge', locale, { n: '5' }) }, { status: 400 })
  }

  // The REAL type, by the leading bytes — not the client's File.type or file name.
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffImageType(bytes)
  if (!kind || !CHAT_MEDIA_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'bad_image_type', message: serverMessage('media.imageType', locale) }, { status: 400 })
  }

  // Re-encode without EXIF/XMP (GPS) BEFORE anything is stored; a file that passed the signature but cannot be decoded is refused, never stored untouched.
  let clean: Buffer
  try {
    clean = (await stripImageMetadata(bytes, kind)).bytes
  } catch (e) {
    console.error('[messaging/media] metadata strip failed, refusing the upload:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'bad_image_type', message: serverMessage('media.imageType', locale) }, { status: 400 })
  }

  // The picture's size, from the clean bytes. Not essential: if it cannot be read the picture is still stored, with no size (the page then reserves no space).
  let width: number | null = null
  let height: number | null = null
  try {
    const meta = await sharp(clean).metadata()
    width = typeof meta.width === 'number' && meta.width > 0 ? meta.width : null
    height = typeof meta.height === 'number' && meta.height > 0 ? meta.height : null
  } catch { /* stored without a size */ }

  const path = chatMediaPath(params.id, user.id, kind)
  const { error } = await createAdminClient().storage.from(CHAT_MEDIA_BUCKET).upload(path, clean, { contentType: imageMime(kind), upsert: false })
  if (error) {
    console.error('[messaging/media] upload failed:', error.message)
    return NextResponse.json({ error: 'upload_failed', message: serverMessage('media.uploadFailed', locale) }, { status: 500 })
  }

  return NextResponse.json({ media: { path, type: 'image', width, height } })
}
