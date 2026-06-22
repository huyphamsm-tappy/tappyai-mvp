import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Best-effort in-memory rate limit (20 scans/day per IP per lambda instance)
const rlStore = new Map<string, { date: string; count: number }>()

function checkRL(ip: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  const e = rlStore.get(ip)
  if (!e || e.date !== today) { rlStore.set(ip, { date: today, count: 1 }); return true }
  if (e.count >= 20) return false
  e.count++
  return true
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRL(ip)) {
    return NextResponse.json({ error: 'Bạn đã quét quá 20 tài liệu hôm nay. Thử lại vào ngày mai.' }, { status: 429 })
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
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            image: imageBase64,
            mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
          },
          {
            type: 'text',
            text: 'Hãy trích xuất toàn bộ văn bản (text) trong ảnh này một cách chính xác và đầy đủ nhất có thể. Giữ nguyên định dạng đoạn văn, xuống dòng, và thứ tự đọc tự nhiên (từ trái sang phải, từ trên xuống dưới). Chỉ trả về nội dung văn bản trích xuất được — không thêm giải thích, không thêm nhận xét. Nếu ảnh không chứa văn bản, trả lời: "Không tìm thấy văn bản trong ảnh."',
          },
        ],
      }],
      maxTokens: 2048,
    })
    return NextResponse.json({ text: text.trim() })
  } catch {
    return NextResponse.json({ error: 'Lỗi khi đọc tài liệu. Vui lòng thử lại.' }, { status: 500 })
  }
}
