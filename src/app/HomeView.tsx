'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import CategoryPills from '@/components/CategoryPills'
import SearchBar from '@/components/SearchBar'
import { formatRelativeTime, cn } from '@/lib/utils'
import { MessageCircle, Sparkles, ChevronRight, ScanText, ArrowLeftRight, Calculator, Music2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

interface Suggestion { text: string; category: string; emoji: string; gradient: string }
interface Conv { id: string; title: string; messageCount: number; updated_at: string }

// English hero greetings by VN-hour slot. Vietnamese keeps the server-computed
// text (passed in) so its full weekday/weekend variety is preserved; EN is
// computed here client-side when the user switches language.
const HERO_EN: { range: [number, number]; weekday: string[]; weekend?: string[] }[] = [
  { range: [0, 5], weekday: ['Still up? 🌙<br />Tappy is here — need anything?', 'Late night —<br />but Tappy is ready 🌛'] },
  { range: [5, 9], weekday: ['Good morning!<br />What sounds good today? ☀️', 'A new day begins —<br />Tappy is here to help! 🌅'], weekend: ['Weekend morning!<br />Rest, or somewhere fun? ☀️', 'Weekend’s on —<br />want a good brunch spot? 🥞'] },
  { range: [9, 11], weekday: ['The morning is rolling —<br />what do you need? ⚡', 'Tappy here!<br />Ask anything, instant answers 🚀'] },
  { range: [11, 14], weekday: ['Hungry?<br />Tappy finds a great lunch spot! 🍚', 'Lunch o’clock —<br />let Tappy pick for you 🥢'] },
  { range: [14, 17], weekday: ['Afternoon —<br />coffee or a relaxing spa? ☕', 'Afternoon slump?<br />Tappy’s got a few ideas 💡'] },
  { range: [17, 20], weekday: ['Off work!<br />Where to eat tonight? 🎊', 'Prime evening —<br />Tappy suggests a great spot! 🍜'], weekend: ['Weekend evening!<br />Out, or something tasty? 🎊', 'Weekend prime time —<br />let Tappy find a spot! 🍜'] },
  { range: [20, 24], weekday: ['Lovely night —<br />where’s worth going? Ask Tappy 🌃', 'End of the day —<br />let Tappy help you unwind! 🛁'] },
]

function heroEN(hour: number, isWeekend: boolean, dom: number): string {
  const slot = HERO_EN.find((s) => hour >= s.range[0] && hour < s.range[1]) ?? HERO_EN[1]
  const texts = isWeekend && slot.weekend ? slot.weekend : slot.weekday
  return texts[dom % texts.length]
}

export default function HomeView({
  user, userInfo, firstName, heroTextVi, heroHour, heroIsWeekend, heroDom, suggestions, conversations,
}: {
  user: boolean
  userInfo: ComponentProps<typeof Header>['user']
  firstName: string
  heroTextVi: string
  heroHour: number
  heroIsWeekend: boolean
  heroDom: number
  suggestions: Suggestion[]
  conversations: Conv[]
}) {
  const { t, locale } = useTranslation()
  const heroText = locale === 'en' ? heroEN(heroHour, heroIsWeekend, heroDom) : heroTextVi

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
              {user ? t('home.greetingUser', { name: firstName }) : t('home.greetingGuest')}
            </p>
            <h1 className="text-white text-2xl sm:text-3xl lg:text-4xl font-black leading-tight mb-5" dangerouslySetInnerHTML={{ __html: heroText }} />
            <SearchBar variant="hero" />
          </div>
        </div>

        {/* Categories */}
        <section>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-accent-500" />
            {t('home.exploreByCategory')}
          </h3>
          <CategoryPills />
        </section>

        {/* Fortune */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">{t('home.fortuneTitle')}</h3>
            <Link href="/boi" className="text-sm text-primary-500 font-medium">{t('home.seeAll')}</Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Link href="/boi/tarot" className="flex flex-col items-center gap-1.5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-center">
              <span className="text-2xl">🔮</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200 leading-tight">{t('home.tarot')}</span>
            </Link>
            <Link href="/boi/tu-vi" className="flex flex-col items-center gap-1.5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-center">
              <span className="text-2xl">🧧</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200 leading-tight">{t('home.horoscope')}</span>
            </Link>
            <Link href="/boi/cung-hoang-dao" className="flex flex-col items-center gap-1.5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-center">
              <span className="text-2xl">✨</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200 leading-tight">{t('home.zodiac')}</span>
            </Link>
          </div>
        </section>

        {/* Scan */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">{t('home.scanTitle')}</h3>
            <Link href="/scan" className="text-sm text-primary-500 font-medium">{t('home.open')}</Link>
          </div>
          <Link href="/scan" className="group flex items-center gap-4 rounded-2xl bg-gradient-to-br from-teal-500/15 to-cyan-400/5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-900/30 dark:to-cyan-900/30 flex items-center justify-center flex-shrink-0 shadow-sm">
              <ScanText size={28} className="text-teal-600 dark:text-teal-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{t('home.scanCardTitle')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{t('home.scanCardDesc')}</p>
            </div>
            <ChevronRight size={18} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
          </Link>
        </section>

        {/* Tappy Together */}
        <section>
          <Link href="/group/new" className="group flex items-center gap-4 rounded-2xl bg-gradient-to-br from-violet-500/15 to-pink-400/5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-pink-100 dark:from-violet-900/30 dark:to-pink-900/30 flex items-center justify-center shadow-sm flex-shrink-0">
              <span className="text-2xl">👥</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">{t('home.togetherTitle')}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{t('home.togetherDesc')}</p>
            </div>
            <ChevronRight size={18} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
          </Link>
        </section>

        {/* Recommendations + Music */}
        <section>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/recommendations" className="group flex flex-col gap-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-100 to-accent-100 dark:from-primary-900/30 dark:to-accent-900/30 flex items-center justify-center shadow-sm">
                <Sparkles size={20} className="text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{t('home.recTitle')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">{t('home.recDesc')}</p>
              </div>
            </Link>
            <Link href="/music" className="group flex flex-col gap-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 flex items-center justify-center shadow-sm">
                <Music2 size={20} className="text-pink-600 dark:text-pink-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">{t('home.musicTitle')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">{t('home.musicDesc')}</p>
              </div>
            </Link>
          </div>
        </section>

        {/* Tools */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">{t('home.toolsTitle')}</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/currency" className="group flex flex-col gap-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 flex items-center justify-center shadow-sm">
                <ArrowLeftRight size={20} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{t('home.currencyTitle')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">{t('home.currencyDesc')}</p>
              </div>
            </Link>
            <Link href="/split-bill" className="group flex flex-col gap-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 flex items-center justify-center shadow-sm">
                <Calculator size={20} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">{t('home.splitTitle')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">{t('home.splitDesc')}</p>
              </div>
            </Link>
            <Link href="/translate" className="group flex flex-col gap-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/30 dark:to-sky-900/30 flex items-center justify-center shadow-sm">
                <span className="text-xl">🌐</span>
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{t('home.translateTitle')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">{t('home.translateDesc')}</p>
              </div>
            </Link>
            <Link href="/game" className="group flex flex-col gap-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 flex items-center justify-center shadow-sm">
                <span className="text-xl">🎮</span>
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">{t('home.gamesTitle')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">{t('home.gamesDesc')}</p>
              </div>
            </Link>
          </div>
        </section>

        {/* Content writer */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">{t('home.contentTitle')}</h3>
            <Link href="/viet-content" className="text-sm text-primary-500 font-medium">{t('home.open')}</Link>
          </div>
          <Link href="/viet-content" className="group flex items-center gap-4 rounded-2xl bg-gradient-to-br from-pink-500/15 to-orange-400/5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 flex items-center justify-center text-3xl flex-shrink-0 shadow-sm">✍️</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{t('home.contentCardTitle')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{t('home.contentCardDesc')}</p>
            </div>
            <ChevronRight size={18} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
          </Link>
        </section>

        {/* AI Suggestions (prompt examples stay in their original language) */}
        <section>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t('home.suggestionsTitle')}</h3>
          <div className="grid grid-cols-2 gap-3">
            {suggestions.map((item) => (
              <Link key={item.text} href={`/chat?q=${encodeURIComponent(item.text)}&category=${item.category}`} className="group rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className={cn('h-16 flex items-center justify-center text-3xl bg-gradient-to-br', item.gradient)}>{item.emoji}</div>
                <div className="p-3">
                  <p className="text-sm leading-snug font-medium text-gray-700 dark:text-gray-200 line-clamp-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{item.text}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Recent conversations */}
        {user && conversations.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">{t('home.recentTitle')}</h3>
              <Link href="/profile" className="text-sm text-primary-500 font-medium">{t('home.seeAll')}</Link>
            </div>
            <div className="space-y-2">
              {conversations.map((conv) => (
                <Link key={conv.id} href={`/chat/${conv.id}`} className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 hover:border-primary-200 dark:hover:border-primary-800 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <MessageCircle size={18} className="text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{conv.title}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('home.messages', { n: String(conv.messageCount) })} · {formatRelativeTime(conv.updated_at)}</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {user && conversations.length === 0 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mx-auto mb-3">
              <MessageCircle size={28} className="text-primary-400" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t('home.emptyChat')}</p>
            <Link href="/chat" className="inline-block mt-3 btn-primary text-sm py-2 px-5">{t('home.chatNow')}</Link>
          </div>
        )}

        {!user && (
          <div className="text-center py-4">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">{t('home.loginPrompt')}</p>
            <Link href="/login" className="inline-block btn-primary text-sm py-2.5 px-6">{t('home.login')}</Link>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
