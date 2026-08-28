'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import MenuItem from '@/components/MenuItem'
import UserAvatar from '@/components/UserAvatar'
import { Mail, User as UserIcon, Calendar, Edit3, Camera } from 'lucide-react'
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
          {/* The avatar is the affordance: tapping it goes to /profile/edit, which already owns
              the picker and the upload. Users were looking for it here, not in a menu row. */}
          <Link href="/profile/edit" data-testid="account-avatar-edit" aria-label={t('editProfile.changeAvatar')} className="relative">
            <UserAvatar
              src={userInfo.avatar_url}
              name={userInfo.full_name || firstName}
              size={80}
              className="ring-2 ring-primary-100 dark:ring-primary-900"
            />
            <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-interactive flex items-center justify-center shadow-md">
              <Camera size={13} className="text-white" />
            </span>
          </Link>
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
