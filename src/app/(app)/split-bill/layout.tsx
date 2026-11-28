import AccountGate from '@/components/auth/AccountGate'

// Owner 28/11/2026: the bill splitter runs in the browser, so the gate is here and not in an API: a visitor sees it, inert, under a sign-in banner.
export default function SplitBillLayout({ children }: { children: React.ReactNode }) {
  return <AccountGate>{children}</AccountGate>
}
