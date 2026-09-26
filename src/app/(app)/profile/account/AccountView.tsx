'use client'

import Link from 'next/link'
import MenuItem from '@/components/MenuItem'
import UserAvatar from '@/components/UserAvatar'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import Panel from '@/components/v3/Panel'
import { Mail, User as UserIcon, Calendar, Edit3, Camera, Contact, Pencil } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// C14 + C15 — the page next door was a server component, so its copy was written in Vietnamese and
// an English session read "Tài khoản / THÔNG TIN / Họ và tên / Chưa cập nhật / Ngày tham gia".
// Same split as /subscription and /profile/history: the server keeps the session and the data, the
// presentation moves here where the chosen locale is knowable.
//
// ── Phase 7 RC (§9): the V3 shell ───────────────────────────────────────────
//
// This screen still carried the pre-V3 chrome — `Header` + `BottomNav` on a grey page — while
// Profile, Saved, QR, Inbox, History and Explore had all moved to `V3Shell`. Opening "Tài khoản"
// from the V3 sidebar dropped the sidebar itself, which is what made it read as a different
// product. Only the chrome changed here: every row, its data source and its destination are the
// ones that were already shipping.
//
// 🚨 WHAT THIS PAGE IS NOT. The canonical reference also shows a "Tài khoản & Cài đặt" HUB — the
// nine-row inventory (Tài khoản · Lịch sử chat · Lịch đặt chỗ · Sở thích của tôi · Đã lưu · Theo
// dõi giá · AI Planner · Tappy biết gì về bạn · Đi nhóm) beside a Settings panel. That hub already
// exists, once, as the lower half of `/profile` (`ProfileRows.accountRows` + `settingsRows`, pinned
// by profileRowParity.test.tsx). Rebuilding it here would be a second copy of the same inventory,
// so this page stays what it has always been: the first of those nine rows — the account record
// itself, and the way to edit it.

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
    <V3Shell
      title={t('account.title')}
      subtitle={userInfo.email ?? undefined}
      activeTab="/profile"
      user={{ name: userInfo.full_name ?? firstName, avatarUrl: userInfo.avatar_url ?? null }}
    >
      {/* One centred column, like Saved: an account record is a short list, not a dashboard. */}
      <div className="mx-auto w-full max-w-[560px] space-y-4">
        <section className="v3-panel flex flex-col items-center p-6 text-center">
          {/* The avatar is the affordance: tapping it goes to /profile/edit, which already owns
              the picker and the upload. Users were looking for it here, not in a menu row. */}
          <Link href="/profile/edit" data-testid="account-avatar-edit" aria-label={t('editProfile.changeAvatar')} className="relative">
            <UserAvatar
              src={userInfo.avatar_url}
              name={userInfo.full_name || firstName}
              size={80}
            />
            <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full shadow-md" style={{ background: 'var(--v3-accent)' }}>
              <Camera size={13} className="text-white" />
            </span>
          </Link>
          <h2 className="mt-3 text-lg font-bold" style={{ color: 'var(--v3-fg)' }}>{userInfo.full_name || firstName}</h2>
          <p className="w-full truncate text-sm" style={{ color: 'var(--v3-fg-secondary)' }}>{userInfo.email}</p>
        </section>

        <Panel title={t('account.section.info')} tone="accent" icon={<Contact size={16} />} bodyClassName="p-0">
          <div className="divide-y" style={{ borderColor: 'var(--v3-border)' }}>
            <MenuItem icon={UserIcon} label={t('account.fullName')} description={userInfo.full_name || t('account.notSet')} />
            <MenuItem icon={Mail} label={t('account.email')} description={userInfo.email ?? ''} />
            {joinDate && <MenuItem icon={Calendar} label={t('account.joinDate')} description={joinDate} />}
          </div>
        </Panel>

        <Panel title={t('account.section.edit')} tone="violet" icon={<Pencil size={16} />} bodyClassName="p-0">
          <div className="divide-y" style={{ borderColor: 'var(--v3-border)' }}>
            <MenuItem icon={Edit3} label={t('account.editProfile')} description={t('account.editProfile.desc')} href="/profile/edit" />
          </div>
        </Panel>
      </div>

      <V3Footer />
    </V3Shell>
  )
}
