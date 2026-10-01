import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { selfDeleteEnabled } from '@/lib/account/selfDelete'
import DeleteAccountView from './DeleteAccountView'

// Where self-service deletion is not enabled (production until D1/D2/D4 are applied), this
// route is the public request page — never a button that cannot keep its promise.
export default async function DeleteAccountSettingsPage() {
  if (!selfDeleteEnabled()) redirect('/delete-account')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.is_anonymous) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle()
  // The paid-plan paragraph shows only for an ACTIVE subscription (same source as the Premium badge); no new field.
  const { data: subscription } = await supabase.from('subscriptions').select('status').eq('user_id', user.id).maybeSingle()
  return <DeleteAccountView user={{ name: profile?.full_name ?? null, avatarUrl: profile?.avatar_url ?? null }} hasPaidPlan={subscription?.status === 'active'} />
}
