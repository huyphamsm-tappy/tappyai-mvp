'use client'

import Image from 'next/image'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import MenuItem from '@/components/MenuItem'
import { Mail, User as UserIcon, Calendar, Edit3 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// C14 + C15 — the page next door was a server component, so its copy was written in Vietnamese and
// an English session read "Tài khoản / THÔNG TIN / Họ và tên / Chưa cập nhật / Ngày tham gia".
// Same split as /subscription and /profile/history: the server keeps the session and the data, the
// presentation moves here where the chosen locale is knowable.

type Props = {
  userInfo: {
    full_name?: string | null
    avatar_url?: string | null
    email?: string | null
    created_at?: string | null
  }
  /** Bare name from the server — may be empty; the localized fallback is applied here. */
  firstName: string
  joinDateIso: string | null
}

export default function AccountView({ userInfo, firstName: rawFirstName, joinDateIso }: Props) {
  const { t, locale } = useTranslation()
  const firstName = rawFirstName || t('home.friend')
  const joinDate = joinDateIso
    ? new Date(joinDateIso).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB')
    : null

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/profile" title={t('account.title')} />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="card p-6 flex flex-col items-center text-center">
          {userInfo.avatar_url ? (
            <Image
              src={userInfo.avatar_url}
              alt={userInfo.full_name || t('account.avatarAlt')}
              width={80}
              height={80}
              className="w-20 h-20 rounded-2xl object-cover ring-2 ring-primary-100 dark:ring-primary-900"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center">
              <span className="text-white text-3xl font-bold">{firstName[0]?.toUpperCase()}</span>
            </div>
          )}
          <h2 className="font-bold text-gray-900 dark:text-white text-lg mt-3">{userInfo.full_name || firstName}</h2>
          <p className="w-full truncate text-content-secondary text-sm">{userInfo.email}</p>
        </div>

        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            {t('account.section.info')}
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem icon={UserIcon} label={t('account.fullName')} description={userInfo.full_name || t('account.notSet')} />
            <MenuItem icon={Mail} label={t('account.email')} description={userInfo.email ?? ''} />
            {joinDate && <MenuItem icon={Calendar} label={t('account.joinDate')} description={joinDate} />}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            {t('account.section.edit')}
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem icon={Edit3} label={t('account.editProfile')} description={t('account.editProfile.desc')} href="/profile/edit" />
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  )
}
