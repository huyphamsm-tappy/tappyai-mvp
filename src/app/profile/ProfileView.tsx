'use client'

import UserAvatar from '@/components/UserAvatar'
import QRProfileButton from '@/components/QRProfileButton'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import Panel from '@/components/v3/Panel'
import { Settings, UserCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { ProfileRowList, accountRows, settingsRows } from './ProfileRows'

// ── V3 Web redesign · §8 Profile ────────────────────────────────────────────
//
// PRESENTATION ONLY. Auth is untouched: `page.tsx` still does the server-side
// `getUser()`, still renders `GuestProfileView` for anonymous visitors, and every
// destination keeps its own server-side check. Nothing here reads or writes
// account state.
//
// 🚨 EVERY ROW SURVIVED. The old screen was a light two-group `MenuItem` list; this
// is the same inventory in V3 panels, both product flags still gating their rows
// (see ProfileRows). A restyle that quietly drops a destination is a capability
// loss wearing a coat of paint.
//
// 🚨 NO INVENTED IDENTITY. The reference shows post/follower/following counts. This
// screen is given a conversation count and nothing else, so the conversation count
// is what it shows. A "0 followers" the server never sent is a claim about the
// user's account.

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
export default function ProfileView({ userId, userInfo, firstName: rawFirstName, conversationCount }: ProfileViewProps) {
  const { t } = useTranslation()
  // C14 — the server cannot know the language, so it sends the bare name (possibly empty) and the
  // localized fallback word is applied here, where the dictionary is.
  const firstName = rawFirstName || t('home.friend')
  const displayName = userInfo.full_name || firstName

  return (
    <V3Shell
      title={t('v3.panel.profile')}
      subtitle={displayName}
      activeTab="/profile"
      user={{ name: displayName, avatarUrl: userInfo.avatar_url }}
    >
      <div className="space-y-4">
        {/* Identity */}
        <section className="v3-panel">
          <div className="flex items-center gap-4 p-5">
            <UserAvatar src={userInfo.avatar_url} name={displayName} size={64} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold" style={{ color: 'var(--v3-fg)' }}>{displayName}</h2>
              <p className="truncate text-[13px]" style={{ color: 'var(--v3-fg-secondary)' }}>{userInfo.email}</p>
              <span
                className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
              >
                {t('profile.conversationCount', { n: String(conversationCount) })}
              </span>
            </div>
            <QRProfileButton userId={userId} name={displayName} />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title={t('profile.accountSection')} tone="accent" icon={<UserCircle size={13} />} bodyClassName="p-2">
            <ProfileRowList rows={accountRows()} />
          </Panel>

          <Panel title={t('profile.settingsSection')} tone="violet" icon={<Settings size={13} />} bodyClassName="p-2">
            <ProfileRowList rows={settingsRows()} />
          </Panel>
        </div>

        <V3Footer />
      </div>
    </V3Shell>
  )
}
