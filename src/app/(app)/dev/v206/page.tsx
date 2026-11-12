import { notFound } from 'next/navigation'
import HarnessClient from './HarnessClient'

// DEV TEST HARNESS for the v206 mockup (docs/uat/V206-HARNESS-*.md). It draws the product's REAL workspace and chat from fixed local fixtures, with no model and no paid
// service, so each mockup tab can be compared with what the product renders. It exists only outside a production build: this page is the one place that decides,
// and it answers the framework's 404 in production (a preview deployment is a production build too). Nothing in the product links to it.
export const dynamic = 'force-dynamic'

export default function V206HarnessPage({ searchParams }: { searchParams?: { s?: string; bar?: string } }) {
  if (process.env.NODE_ENV === 'production') notFound()
  // ONE clock for the server render and the hydration (the sidebar's "x phút trước" must read the same in both)
  return <HarnessClient scenarioParam={searchParams?.s} showBar={searchParams?.bar !== '0'} nowMs={Date.now()} />
}
