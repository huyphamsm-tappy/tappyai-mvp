import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import CategoryPills from '@/components/CategoryPills'
import SearchBar from '@/components/SearchBar'
import { formatRelativeTime, cn } from '@/lib/utils'
import { MessageCircle, Sparkles, ChevronRight, ScanText, ArrowLeftRight, Calculator } from 'lucide-react'
import { getDynamicPrompts } from '@/lib/suggestedPrompts'
import { getMemory } from '@/lib/memory/memoryService'

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

  // Dynamic hero heading theo giờ VN
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
      // Weekend evenings have no "just got off work" — use weekend-appropriate copy.
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
  // Dùng ngày trong tháng để chọn deterministically (không random server/client mismatch)
  const dayOfMonth = vnTime.getUTCDate()
  const heroText = slot.texts[dayOfMonth % slot.texts.length]

  const userInfo = user
    ? {
        full_name: profile?.full_name ?? user.user_metadata?.full_name,
        avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url,
        email: user.email, // always from session; profiles.email is being removed
      }
    : undefined

  const firstName = userInfo?.full_name?.split(' ').pop() || userInfo?.email?.split('@')[0] || 'bạn'

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-20">
      <Header user={userInfo} />

      <main className="container-content py-6 md:py-8 space-y-6 md:space-y-8">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-500 via-primary-600 to-accent-500 p-6 pb-7 md:p-8 md:pb-9 shadow-lg shadow-primary-500/20">
          <div className="absolute -top-14 -right-14 w-48 h-48 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -bottom-16 -left-10 w-40 h-40 rounded-full bg-accent-300/20 blur-2xl pointer-events-none" />

          <div className="relative">
            <p className="text-white/80 text-sm font-medium mb-1">
              {user ? `Xin chào, ${firstName} 👋` : 'Chào mừng đến với TappyAI 👋'}
            </p>
            <h1 className="text-white text-2xl sm:text-3xl lg:text-4xl font-black leading-tight mb-5"
              dangerouslySetInnerHTML={{ __html: heroText }}
            />
            <SearchBar variant="hero" />
          </div>
        </div>

        {/* Categories */}
        <section>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-accent-500" />
            Khám phá theo lĩnh vực
          </h3>
          <CategoryPills />
        </section>

        {/* Xem bói online */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">🔮 Xem bói hôm nay</h3>
            <Link href="/boi" className="text-sm text-primary-500 font-medium">Xem tất cả</Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Link href="/boi/tarot" className="flex flex-col items-center gap-1.5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-center">
              <span className="text-2xl">🔮</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200 leading-tight">Tarot</span>
            </Link>
            <Link href="/boi/tu-vi" className="flex flex-col items-center gap-1.5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-center">
              <span className="text-2xl">🧧</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200 leading-tight">Tử vi</span>
            </Link>
            <Link href="/boi/cung-hoang-dao" className="flex flex-col items-center gap-1.5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-center">
              <span className="text-2xl">✨</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200 leading-tight">Cung HĐ</span>
            </Link>
          </div>
        </section>

        {/* Quét tài liệu */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">📷 Quét tài liệu</h3>
            <Link href="/scan" className="text-sm text-primary-500 font-medium">Mở</Link>
          </div>
          <Link
            href="/scan"
            className="group flex items-center gap-4 rounded-2xl bg-gradient-to-br from-teal-500/15 to-cyan-400/5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-900/30 dark:to-cyan-900/30 flex items-center justify-center flex-shrink-0 shadow-sm">
              <ScanText size={28} className="text-teal-600 dark:text-teal-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                Chụp ảnh → AI trích xuất văn bản
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                Quét tài liệu giấy, hóa đơn, thực đơn — xuất ra .TXT, .DOCX hoặc chia sẻ ngay.
              </p>
            </div>
            <ChevronRight size={18} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
          </Link>
        </section>

        {/* Tappy Together */}
        <section>
          <Link
            href="/group/new"
            className="group flex items-center gap-4 rounded-2xl bg-gradient-to-br from-violet-500/15 to-pink-400/5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-pink-100 dark:from-violet-900/30 dark:to-pink-900/30 flex items-center justify-center shadow-sm flex-shrink-0">
              <span className="text-2xl">👥</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                Tappy Together
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                Cùng nhóm chọn quán ăn — AI gợi ý hợp ý tất cả mọi người
              </p>
            </div>
            <ChevronRight size={18} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
          </Link>
        </section>

        {/* Đổi tiền tệ + Chia tiền */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">🛠️ Công cụ tiện ích</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/currency"
              className="group flex flex-col gap-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 flex items-center justify-center shadow-sm">
                <ArrowLeftRight size={20} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  💱 Đổi tiền tệ
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">
                  VND, USD, EUR, JPY... tỷ giá thực
                </p>
              </div>
            </Link>
            <Link
              href="/split-bill"
              className="group flex flex-col gap-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 flex items-center justify-center shadow-sm">
                <Calculator size={20} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                  🧮 Chia tiền
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">
                  Chia đều hoặc theo món, có tip
                </p>
              </div>
            </Link>
            <Link
              href="/translate"
              className="group flex flex-col gap-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/30 dark:to-sky-900/30 flex items-center justify-center shadow-sm">
                <span className="text-xl">🌐</span>
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  🌐 Dịch thuật
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">
                  Dịch nhanh đa ngôn ngữ
                </p>
              </div>
            </Link>
            <Link
              href="/game"
              className="group flex flex-col gap-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 flex items-center justify-center shadow-sm">
                <span className="text-xl">🎮</span>
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                  🎮 Games
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">
                  Giải trí, thư giãn nhanh
                </p>
              </div>
            </Link>
          </div>
        </section>

        {/* Viết content */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">✍️ Viết content mạng xã hội</h3>
            <Link href="/viet-content" className="text-sm text-primary-500 font-medium">Mở</Link>
          </div>
          <Link
            href="/viet-content"
            className="group flex items-center gap-4 rounded-2xl bg-gradient-to-br from-pink-500/15 to-orange-400/5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 flex items-center justify-center text-3xl flex-shrink-0 shadow-sm">
              ✍️
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                Caption Facebook, TikTok, Instagram
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                Nhập chủ đề, chọn tone và độ dài — AI viết caption + hashtag ngay.
              </p>
            </div>
            <ChevronRight size={18} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
          </Link>
        </section>

        {/* AI Suggestions */}
        <section>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Gợi ý hôm nay</h3>
          <div className="grid grid-cols-2 gap-3">
            {SUGGESTIONS.map((item) => (
              <Link
                key={item.text}
                href={`/chat?q=${encodeURIComponent(item.text)}&category=${item.category}`}
                className="group rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className={cn('h-16 flex items-center justify-center text-3xl bg-gradient-to-br', item.gradient)}>
                  {item.emoji}
                </div>
                <div className="p-3">
                  <p className="text-sm leading-snug font-medium text-gray-700 dark:text-gray-200 line-clamp-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    {item.text}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Recent conversations */}
        {user && conversations && conversations.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">Trò chuyện gần đây</h3>
              <Link href="/profile" className="text-sm text-primary-500 font-medium">Xem tất cả</Link>
            </div>
            <div className="space-y-2">
              {conversations.map((conv) => {
                const msgCount = Array.isArray(conv.messages) ? conv.messages.length : 0
                return (
                  <Link
                    key={conv.id}
                    href={`/chat/${conv.id}`}
                    className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 hover:border-primary-200 dark:hover:border-primary-800 transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <MessageCircle size={18} className="text-primary-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{conv.title}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {msgCount} tin nhắn · {formatRelativeTime(conv.updated_at)}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {user && conversations?.length === 0 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mx-auto mb-3">
              <MessageCircle size={28} className="text-primary-400" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Bắt đầu trò chuyện đầu tiên với TappyAI!</p>
            <Link href="/chat" className="inline-block mt-3 btn-primary text-sm py-2 px-5">
              Chat ngay
            </Link>
          </div>
        )}

        {!user && (
          <div className="text-center py-4">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">Đăng nhập để lưu lịch sử trò chuyện của bạn</p>
            <Link href="/login" className="inline-block btn-primary text-sm py-2.5 px-6">
              Đăng nhập
            </Link>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
