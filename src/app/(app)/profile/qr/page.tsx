import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QRProfileView from './QRProfileView'

// QR Profile. The V3 sidebar's "QR Profile" row pointed at `/profile`, where the
// QR was a small icon in the header — the row named a destination that did not
// exist as one. This is that destination; the row now points here.
//
// Auth-gated like the rest of `/profile/*`: a QR of "your" profile has no
// signed-out meaning.
export default async function QRProfilePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?returnTo=/profile/qr')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()

  return (
    <QRProfileView
      userId={user.id}
      userInfo={{
        full_name: profile?.full_name ?? user.user_metadata?.full_name,
        avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url,
        email: user.email,
      }}
    />
  )
}
