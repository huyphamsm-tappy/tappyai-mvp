import { notFound } from 'next/navigation'
import { moderationAdminEnabled } from '@/lib/safety/userBlocks'
import NoticesView from './NoticesView'

// Violation notices (owner 01/10). Behind MODERATION_ADMIN_ENABLED: while it is off the page does not exist (404).
export const dynamic = 'force-dynamic'

export default function NoticesPage() {
  if (!moderationAdminEnabled()) notFound()
  return <NoticesView />
}
