'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { performSignOut } from '@/lib/auth/signOut'

export default function SignOutButton() {
  const router = useRouter()
  const { t } = useTranslation()
  // The analytics event and the Supabase call moved into `performSignOut` so the
  // Controller can end a session the same way instead of copying them. Behaviour
  // here is unchanged: emit, tear down, go to /login, refresh.
  const handleSignOut = async () => {
    await performSignOut()
    router.push('/login')
    router.refresh()
  }
  return (
    <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-colors font-medium text-sm">
      <LogOut size={18} />
      {t('settings.signOut')}
    </button>
  )
}
