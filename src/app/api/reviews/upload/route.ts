import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { sniffImageType, imageExt, imageMime } from '@/lib/security/imageType'

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
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập để tải ảnh' }, { status: 401 })

  if (!checkRL(user.id)) {
    return NextResponse.json(
      { error: `Bạn đã tải lên ${MAX_UPLOADS_PER_DAY} ảnh hôm nay. Thử lại vào ngày mai.` },
      { status: 429 }
    )
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Không tìm thấy file' }, { status: 400 })
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File ảnh phải nhỏ hơn 5MB' }, { status: 400 })

  // Validate the REAL file type by its magic bytes, not the client-supplied
  // MIME/extension — blocks SVG/HTML-as-image (stored-XSS) and mislabeled files.
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffImageType(bytes)
  if (!kind) return NextResponse.json({ error: 'Chỉ chấp nhận ảnh JPG, PNG, WebP hoặc GIF' }, { status: 400 })

  try {
    const path = `reviews/${user.id}/${Date.now()}.${imageExt(kind)}`
    const blob = await put(path, file, { access: 'public', contentType: imageMime(kind) })
    return NextResponse.json({ url: blob.url })
  } catch (e) {
    console.error('Blob upload error:', e)
    return NextResponse.json({ error: 'Không thể tải ảnh lên. Vui lòng thử lại.' }, { status: 500 })
  }
}
