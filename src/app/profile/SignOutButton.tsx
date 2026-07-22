'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { emitAuthLogout } from '@/lib/analytics/authEvents'

export default function SignOutButton() {
  const router = useRouter()
  const supabase = createClient()
  const { t } = useTranslation()
  const handleSignOut = async () => {
    emitAuthLogout() // emit before the session is torn down
    await supabase.auth.signOut()
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
