import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GroupNewForm from './GroupNewForm'

export default async function GroupNewPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <GroupNewForm />
}
