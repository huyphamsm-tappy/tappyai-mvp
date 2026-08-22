import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { getMediaProvider, putMedia } from '@/lib/media'
import { sniffImageType, imageExt, imageMime } from '@/lib/security/imageType'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'

// SQL required in Supabase:
// ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS photos text[] DEFAULT '{}';

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
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
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('media.signInToUpload', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

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
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'image_too_large', message: serverMessage('media.imageTooLarge5', requestLocale(req)) }, { status: 400 })

  // Validate the REAL file type by its magic bytes, not the client-supplied
  // MIME/extension — blocks SVG/HTML-as-image (stored-XSS) and mislabeled files.
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffImageType(bytes)
  if (!kind) return NextResponse.json({ error: 'bad_image_type', message: serverMessage('media.imageType', requestLocale(req)) }, { status: 400 })

  try {
    const path = `reviews/${user.id}/${Date.now()}.${imageExt(kind)}`
    // `req` carries the deployment's OIDC token in production — without it a
    // GCS write has no identity to federate with.
    const blob = await putMedia(
      path,
      file,
      { contentType: imageMime(kind) },
      getMediaProvider(process.env, req)
    )
    return NextResponse.json({ url: blob.url })
  } catch (e) {
    console.error('Media upload error:', e)
    return NextResponse.json({ error: 'upload_failed', message: serverMessage('media.uploadFailed', requestLocale(req)) }, { status: 500 })
  }
}
