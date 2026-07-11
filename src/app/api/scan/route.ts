import { AI } from '@/lib/ai/llm'
import { NextRequest, NextResponse } from 'next/server'
import { dailyRateLimit, clientIp } from '@/lib/security/rateLimit'

// Daily cap via the shared limiter (lib/security/rateLimit) — one implementation
// for every daily-capped route instead of per-route Maps.
const DAILY_SCAN_LIMIT = 20

export async function POST(req: NextRequest) {
  if (!dailyRateLimit(`scan:${clientIp(req)}`, DAILY_SCAN_LIMIT).ok) {
    return NextResponse.json({ error: `Bạn đã quét quá ${DAILY_SCAN_LIMIT} tài liệu hôm nay. Thử lại vào ngày mai.` }, { status: 429 })
  }

  let imageBase64: string, mimeType: string
  try {
    const body = await req.json()
    imageBase64 = body.imageBase64
    mimeType = body.mimeType || 'image/jpeg'
    if (!imageBase64) throw new Error('missing image')
    // Strip data URL prefix if present
    if (imageBase64.includes(',')) imageBase64 = imageBase64.split(',')[1]
    // 8MB base64 limit (~6MB binary)
    if (imageBase64.length > 10_000_000) {
      return NextResponse.json({ error: 'Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 6MB.' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 })
  }

  try {
    const { text } = await AI.vision({
      image: imageBase64,
      mimeType,
      prompt: 'Hãy trích xuất toàn bộ văn bản (text) trong ảnh này một cách chính xác và đầy đủ nhất có thể. Giữ nguyên định dạng đoạn văn, xuống dòng, và thứ tự đọc tự nhiên (từ trái sang phải, từ trên xuống dưới). Chỉ trả về nội dung văn bản trích xuất được — không thêm giải thích, không thêm nhận xét. Nếu ảnh không chứa văn bản, trả lời: "Không tìm thấy văn bản trong ảnh."',
      maxTokens: 2048,
    })
    return NextResponse.json({ text: text.trim() })
  } catch {
    return NextResponse.json({ error: 'Lỗi khi đọc tài liệu. Vui lòng thử lại.' }, { status: 500 })
  }
}
