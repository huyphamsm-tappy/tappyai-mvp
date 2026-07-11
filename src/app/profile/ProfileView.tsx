'use client'

import Image from 'next/image'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import MenuItem from '@/components/MenuItem'
import QRProfileButton from '@/components/QRProfileButton'
import { User, MessageCircle, Bookmark, Settings, Crown, CalendarDays, Heart, Users, TrendingDown, Brain, Star, Plug } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
// Pro visibility is a product decision owned by the shared config (single
// source — also served to native clients via GET /api/config).
import { SHOW_PRO_UPGRADE } from '@/lib/config/product'

type ProfileViewProps = {
  userId: string
  userInfo: {
    full_name?: string | null
    avatar_url?: string | null
    email?: string | null
  }
  firstName: string
  conversationCount: number
}

// Client view for the Profile screen so all text is reactive to the language
// toggle. The server page still does auth + profile/count fetch and passes the
// data down as props (mirrors settings/SettingsView.tsx).
export default function ProfileView({ userId, userInfo, firstName, conversationCount }: ProfileViewProps) {
  const { t } = useTranslation()

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Profile card */}
        <div className="card p-6">
          <div className="flex items-center gap-4">
            {userInfo.avatar_url ? (
              <Image
                src={userInfo.avatar_url}
                alt={userInfo.full_name || 'Avatar'}
                width={64}
                height={64}
                className="w-16 h-16 rounded-2xl object-cover ring-2 ring-primary-100 dark:ring-primary-900"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center">
                <span className="text-white text-2xl font-bold">{firstName[0]?.toUpperCase()}</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-gray-900 dark:text-white text-lg">{userInfo.full_name || firstName}</h2>
              <p className="truncate text-gray-500 dark:text-gray-400 text-sm">{userInfo.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 px-2 py-0.5 rounded-full font-medium">
                  {t('profile.conversationCount', { n: String(conversationCount) })}
                </span>
              </div>
            </div>
            <QRProfileButton userId={userId} name={userInfo.full_name || firstName} />
          </div>
        </div>

        {/* Account group */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            {t('profile.accountSection')}
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem icon={User} label={t('profile.account')} description={t('profile.account.desc')} href="/profile/account" />
            <MenuItem icon={MessageCircle} label={t('profile.chatHistory')} description={t('profile.chatHistory.desc')} href="/profile/history" />
            <MenuItem icon={CalendarDays} label={t('profile.bookings')} description={t('profile.bookings.desc')} href="/profile/bookings" />
            <MenuItem icon={Heart} label={t('profile.preferences')} description={t('profile.preferences.desc')} href="/profile/preferences" />
            <MenuItem icon={Bookmark} label={t('profile.saved')} description={t('profile.saved.desc')} href="/profile/favorites" />
            <MenuItem icon={TrendingDown} label={t('profile.priceWatch')} description={t('profile.priceWatch.desc')} href="/profile/price-watches" />
            <MenuItem icon={Brain} label={t('profile.tappyKnows')} description={t('profile.tappyKnows.desc')} href="/profile/tappy-knows" />
            <MenuItem icon={Plug} label={t('profile.integrations')} description={t('profile.integrations.desc')} href="/profile/integrations" />
            <MenuItem icon={Star} label={t('profile.myReviews')} description={t('profile.myReviews.desc')} href="/reviews" />
            <MenuItem icon={Users} label={t('profile.groupDining')} description={t('profile.groupDining.desc')} href="/group/new" />
            {/* Pro upgrade tạm ẩn trong giai đoạn test miễn phí (chưa có pháp nhân
                để thanh toán). Đổi false → true để bật lại khi lên Pro. */}
            {SHOW_PRO_UPGRADE && (
              <MenuItem icon={Crown} label={t('profile.upgradePro')} description={t('profile.upgradePro.desc')} href="/subscription" />
            )}
          </div>
        </section>

        {/* Settings group */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            {t('profile.settingsSection')}
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem icon={Settings} label={t('profile.settings')} description={t('profile.settings.desc')} href="/profile/settings" />
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  )
}
