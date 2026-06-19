import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const PLATFORM_GUIDE: Record<string, string> = {
  facebook: 'Facebook (phong cách thân thiện, có thể dùng emoji, phù hợp mọi lứa tuổi)',
  tiktok: 'TikTok (ngắn gọn, trendy, nhiều emoji, phù hợp Gen Z)',
  instagram: 'Instagram (aesthetic, kể câu chuyện qua hình ảnh, hashtag phong phú)',
}

const TONE_GUIDE: Record<string, string> = {
  funny: 'hài hước, vui tươi, dùng wordplay và ngôn ngữ gần gũi',
  professional: 'chuyên nghiệp, đáng tin cậy, súc tích và rõ ràng',
  emotional: 'chạm đến cảm xúc, kể chuyện, tạo sự đồng cảm sâu sắc',
  youthful: 'trẻ trung, năng động, thân thiện với Gen Z và millennials',
  inspiring: 'truyền cảm hứng, tích cực, tạo động lực cho người đọc',
}

const LENGTH_GUIDE: Record<string, string> = {
  short: 'ngắn gọn 1-2 câu (khoảng 20-40 từ)',
  medium: 'vừa phải 3-5 câu (khoảng 50-100 từ)',
  long: 'đầy đủ 6-10 câu (khoảng 100-200 từ), có thể dùng danh sách nếu phù hợp',
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY chưa được cấu hình trên server.' },
      { status: 500 },
    )
  }

  let body: { topic?: string; platform?: string; tone?: string; length?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Request body không hợp lệ.' }, { status: 400 })
  }

  const { topic, platform = 'facebook', tone = 'youthful', length = 'medium' } = body

  if (!topic?.trim()) {
    return Response.json({ error: 'Vui lòng nhập chủ đề hoặc mô tả.' }, { status: 400 })
  }
  if (topic.trim().length > 500) {
    return Response.json({ error: 'Chủ đề quá dài (tối đa 500 ký tự).' }, { status: 400 })
  }

  const platformDesc = PLATFORM_GUIDE[platform] ?? PLATFORM_GUIDE.facebook
  const toneDesc = TONE_GUIDE[tone] ?? TONE_GUIDE.youthful
  const lengthDesc = LENGTH_GUIDE[length] ?? LENGTH_GUIDE.medium

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: `Bạn là copywriter chuyên nghiệp viết content mạng xã hội tiếng Việt. Nhiệm vụ: viết caption hấp dẫn, tự nhiên, đúng ngôn ngữ và văn hóa Việt Nam. Luôn trả về JSON hợp lệ duy nhất với đúng cấu trúc: {"caption":"<nội dung caption>","hashtags":"<các hashtag cách nhau bằng dấu cách, tối đa 10 hashtag>"}. Không thêm bất kỳ text nào ngoài JSON.`,
      messages: [
        {
          role: 'user',
          content: `Platform: ${platformDesc}\nTone: ${toneDesc}\nĐộ dài caption: ${lengthDesc}\n\nChủ đề/mô tả: "${topic.trim()}"\n\nViết caption và hashtags phù hợp. Trả về JSON duy nhất.`,
        },
      ],
      maxTokens: 900,
      temperature: 0.8,
    })

    // Extract JSON from response (model may wrap it in markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) {
      return Response.json({ error: 'Kết quả không đúng định dạng, vui lòng thử lại.' }, { status: 500 })
    }

    const parsed = JSON.parse(jsonMatch[0]) as { caption?: string; hashtags?: string }
    const caption = (parsed.caption ?? '').trim()
    const hashtags = (parsed.hashtags ?? '').trim()

    if (!caption) {
      return Response.json({ error: 'Không tạo được nội dung, vui lòng thử lại.' }, { status: 500 })
    }

    return Response.json({ caption, hashtags })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('API key') || msg.includes('auth') || msg.includes('401')) {
      return Response.json({ error: 'API key không hợp lệ hoặc chưa được kích hoạt.' }, { status: 500 })
    }
    console.error('[viet-content] API error:', err)
    return Response.json({ error: 'Có lỗi xảy ra, vui lòng thử lại sau.' }, { status: 500 })
  }
}
