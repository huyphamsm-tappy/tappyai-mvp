import { createClient } from '@/lib/supabase/server'
import { getDynamicPrompts } from '@/lib/suggestedPrompts'
import { getMemory } from '@/lib/memory/memoryService'
import HomeView from './HomeView'

export default async function HomePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  let conversations: { id: string; title: string; category: string; updated_at: string; messages: unknown }[] | null = null
  let memory = null

  if (user) {
    const [{ data: profileData }, { data: convData }, mem] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('conversations')
        .select('id, title, category, updated_at, messages')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(5),
      getMemory(user.id),
    ])
    profile = profileData
    conversations = convData
    memory = mem
  }

  // Dynamic prompts — VN time UTC+7, shuffled fresh on each server render
  const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const gender = user?.user_metadata?.gender === 'male' ? 'male' : user?.user_metadata?.gender === 'female' ? 'female' : null
  const SUGGESTIONS = getDynamicPrompts(vnTime.getUTCHours(), vnTime.getUTCDay(), memory, gender)

  // Dynamic hero heading theo giờ VN (Vietnamese — the client localizes to EN)
  const vnHour = vnTime.getUTCHours()
  const vnDay = vnTime.getUTCDay() // 0=CN, 6=T7
  const isWeekend = vnDay === 0 || vnDay === 6

  const HERO_TEXTS: { range: [number, number]; texts: string[] }[] = [
    {
      range: [0, 5],
      texts: [
        'Thức khuya à?<br />Tappy đây, cần gì không? 🌙',
        'Đêm muộn rồi —<br />nhưng Tappy vẫn sẵn sàng 🌛',
        'Còn thức à?<br />Đặt đồ ăn khuya hay cần gì? 🍜',
      ],
    },
    {
      range: [5, 9],
      texts: isWeekend
        ? [
            'Sáng cuối tuần đây!<br />Nghỉ ngơi hay đi đâu vui? ☀️',
            'Cuối tuần bắt đầu —<br />Tappy gợi ý chỗ brunch ngon nhé? 🥞',
            'Chào buổi sáng!<br />Cuối tuần này kế hoạch gì? 🎉',
          ]
        : [
            'Chào buổi sáng!<br />Hôm nay ăn gì ngon đây? ☀️',
            'Ngày mới bắt đầu —<br />Tappy sẵn sàng giúp bạn! 🌅',
            'Sáng sớm rồi,<br />cà phê hay bánh mì trước? ☕',
            'Good morning!<br />Hôm nay Tappy lo hết cho bạn 😄',
          ],
    },
    {
      range: [9, 11],
      texts: [
        'Buổi sáng đang chạy —<br />bạn cần gì từ Tappy? ⚡',
        'Mid-morning rồi,<br />trưa nay ăn gì nghĩ chưa? 🤔',
        'Tappy đây!<br />Hỏi gì cũng được, trả lời liền 🚀',
      ],
    },
    {
      range: [11, 14],
      texts: [
        'Đói chưa?<br />Tappy tìm chỗ ăn trưa ngon ngay! 🍚',
        'Giờ vàng ăn trưa —<br />để Tappy chọn chỗ hộ nhé 🥢',
        'Cơm trưa chưa?<br />Hỏi Tappy trước khi Google nha 😄',
        '12h rồi —<br />ra ngoài hay đặt đồ ăn? Tappy lo! 🛵',
      ],
    },
    {
      range: [14, 17],
      texts: [
        'Chiều rồi,<br />cà phê hay spa thư giãn nhé? ☕',
        '3h chiều —<br />buồn ngủ hay đi đâu cho tỉnh? 😅',
        'Buổi chiều của bạn<br />sẽ thú vị hơn với Tappy! ✨',
        'Slump buổi chiều?<br />Tappy có mấy gợi ý hay đây 💡',
      ],
    },
    {
      range: [17, 20],
      texts: isWeekend
        ? [
            'Tối cuối tuần rồi!<br />Đi chơi hay ăn gì ngon? 🎊',
            'Giờ vàng cuối tuần —<br />Tappy gợi ý quán ngon ngay! 🍜',
            'Tối cuối tuần của bạn,<br />đi đâu cho đáng? 🥂',
            'Tối nay có kế hoạch gì?<br />Tappy lo hết phần tìm kiếm! 😊',
          ]
        : [
            'Tan làm rồi!<br />Tối nay ăn gì, đi đâu? 🎊',
            'Giờ vàng buổi tối —<br />Tappy gợi ý quán ngon ngay! 🍜',
            'Công việc xong rồi,<br />giờ là thời gian của bạn! 🥂',
            'Tối nay có kế hoạch gì?<br />Tappy lo hết phần tìm kiếm! 😊',
          ],
    },
    {
      range: [20, 24],
      texts: [
        'Tối đẹp thế này<br />đi đâu cho đáng? Hỏi Tappy đi 🌃',
        'Đêm xuống rồi —<br />ăn gì, làm gì, đi đâu? 🌙',
        'Cuối ngày rồi,<br />Tappy giúp bạn thư giãn nhé! 🛁',
        'Tối nay vui không?<br />Tappy có vài gợi ý hay đây ✨',
      ],
    },
  ]

  const slot = HERO_TEXTS.find(s => vnHour >= s.range[0] && vnHour < s.range[1]) ?? HERO_TEXTS[1]
  const dayOfMonth = vnTime.getUTCDate()
  const heroTextVi = slot.texts[dayOfMonth % slot.texts.length]

  const userInfo = user
    ? {
        full_name: profile?.full_name ?? user.user_metadata?.full_name,
        avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url,
        email: user.email,
      }
    : undefined

  const firstName = userInfo?.full_name?.split(' ').pop() || userInfo?.email?.split('@')[0] || 'bạn'

  const convList = (conversations ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    messageCount: Array.isArray(c.messages) ? c.messages.length : 0,
    updated_at: c.updated_at,
  }))

  return (
    <HomeView
      user={!!user}
      userInfo={userInfo}
      firstName={firstName}
      heroTextVi={heroTextVi}
      heroHour={vnHour}
      heroIsWeekend={isWeekend}
      heroDom={dayOfMonth}
      suggestions={SUGGESTIONS}
      conversations={convList}
    />
  )
}
