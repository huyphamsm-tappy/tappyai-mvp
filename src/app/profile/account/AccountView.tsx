'use client'

import Image from 'next/image'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import MenuItem from '@/components/MenuItem'
import { Mail, User as UserIcon, Calendar, Edit3 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { formatDateForLocale } from '@/lib/utils'

type AccountUser = {
  full_name?: string | null
  avatar_url?: string | null
  email?: string | null
  created_at?: string | null
}

// Client view for Account so every string is reactive to the language toggle.
// The server page still does auth + profile fetch and passes the user down
// (same split as settings/SettingsView.tsx).
export default function AccountView({ user }: { user: AccountUser }) {
  const { t, locale } = useTranslation()

  const firstName =
    user.full_name?.split(' ').pop() ||
    user.email?.split('@')[0] ||
    t('account_display_name_fallback')
  // Was pinned to 'vi-VN', so English readers saw a Vietnamese-ordered date.
  const joinDate = user.created_at ? formatDateForLocale(user.created_at, locale) : null

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={user} showBack backHref="/profile" title={t('account_title')} />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="card p-6 flex flex-col items-center text-center">
          {user.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt={user.full_name || 'Avatar'}
              width={80}
              height={80}
              className="w-20 h-20 rounded-2xl object-cover ring-2 ring-primary-100 dark:ring-primary-900"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center">
              <span className="text-white text-3xl font-bold">{firstName[0]?.toUpperCase()}</span>
            </div>
          )}
          <h2 className="font-bold text-gray-900 dark:text-white text-lg mt-3">{user.full_name || firstName}</h2>
          <p className="w-full truncate text-gray-500 dark:text-gray-400 text-sm">{user.email}</p>
        </div>

        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            {t('account_info_section')}
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem
              icon={UserIcon}
              label={t('account_full_name_label')}
              description={user.full_name || t('account_no_data_placeholder')}
            />
            <MenuItem icon={Mail} label={t('account_email_label')} description={user.email ?? undefined} />
            {joinDate && <MenuItem icon={Calendar} label={t('account_joined_label')} description={joinDate} />}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            {t('account_edit_section')}
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem
              icon={Edit3}
              label={t('account_edit_profile')}
              description={t('account_edit_profile_desc')}
              href="/profile/edit"
            />
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  )
}
