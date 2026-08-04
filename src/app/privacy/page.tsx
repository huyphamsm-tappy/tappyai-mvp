import type { Metadata } from 'next'
import Header from '@/components/Header'
import { OG_IMAGE, SITE_URL } from '@/components/landing/config'

// Public Privacy Policy required by the Google Play Console listing, so this
// route must stay statically renderable and reachable without auth: no session
// reads, no client data fetching. Header is the only client component here —
// it is what applies the `dark` class to <html> (Tailwind runs darkMode:'class',
// and nothing else on a directly-loaded legal page would light it up).

const PAGE_URL = `${SITE_URL}/privacy`
const TITLE = 'Privacy Policy — TappyAI'
const DESCRIPTION =
  'How TappyAI collects, uses, stores, and protects your information, including Google account data, conversation history, and the third-party AI and search providers we rely on.'

// Deliberately NOT the SUPPORT_EMAIL in landing/config.ts (a personal mailbox):
// the published policy commits to the branded support address, which is the one
// listed on the Play Console entry. Keep the two in sync only once config.ts's
// "no dedicated support@ mailbox yet" note stops being true.
const SUPPORT_EMAIL = 'support@tappyai.com'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    siteName: 'TappyAI',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: `${SITE_URL}${OG_IMAGE}` }],
    locale: 'en_US',
    alternateLocale: ['vi_VN'],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}${OG_IMAGE}`],
  },
  robots: { index: true, follow: true },
}

/** Numbered policy section with an accessible heading association. */
function Section({
  id,
  heading,
  children,
}: {
  id: string
  heading: string
  children: React.ReactNode
}) {
  const headingId = `${id}-heading`
  return (
    <section aria-labelledby={headingId} className="scroll-mt-20 space-y-3">
      <h2
        id={headingId}
        className="text-fluid-h3 font-semibold text-gray-900 dark:text-white"
      >
        {heading}
      </h2>
      {children}
    </section>
  )
}

/** Policy body copy — one shared measure/leading for every paragraph. */
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-fluid-body text-gray-600 dark:text-gray-300">{children}</p>
}

/**
 * Bulleted list. The marker is a decorative span rather than a native
 * list-style dot so it can carry the brand accent colour and stay aligned with
 * the first line of wrapped items.
 */
function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-fluid-body text-gray-600 dark:text-gray-300">
          <span
            aria-hidden="true"
            className="mt-[0.65em] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-500"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950">
      <Header showBack backHref="/" />

      <main className="container-content py-10 sm:py-14">
        <header className="mb-8 sm:mb-10">
          <h1 className="text-fluid-display font-bold text-gray-900 dark:text-white">
            Privacy Policy
          </h1>
          {/* Decorative accent rule — mirrors the marketing sections */}
          <span
            aria-hidden="true"
            className="mt-4 block h-1 w-12 rounded-full bg-accent-500"
          />
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Effective Date: August 2026
          </p>
        </header>

        <div className="space-y-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10 sm:space-y-10 sm:p-8">
          <Section id="information-we-collect" heading="1. Information We Collect">
            <P>TappyAI may collect:</P>
            <Bullets
              items={[
                'Google account information (name, email address, profile photo) when you sign in with Google.',
                'Conversation history with the AI assistant.',
                'Basic account information required to provide our services.',
              ]}
            />
          </Section>

          <Section id="how-we-use-your-information" heading="2. How We Use Your Information">
            <P>We use your information to:</P>
            <Bullets
              items={[
                'Provide AI-powered conversations.',
                'Save and restore your conversation history.',
                'Display your account profile.',
                'Improve the quality and reliability of the service.',
                'Protect platform security.',
              ]}
            />
            <P>
              <strong className="font-semibold text-gray-900 dark:text-white">
                We do not sell your personal information.
              </strong>
            </P>
          </Section>

          <Section id="third-party-services" heading="3. Third-Party Services">
            <P>
              To provide AI responses and search-related features, TappyAI may send relevant
              user requests to trusted providers, including:
            </P>
            <Bullets items={['Anthropic Claude', 'Google Search services']} />
            <P>These providers process data according to their own privacy policies.</P>
          </Section>

          <Section id="data-storage-and-security" heading="4. Data Storage and Security">
            <P>
              User data is securely stored using Supabase infrastructure with authentication
              and access controls.
            </P>
            <P>
              Only authenticated users can access their own account information and
              conversation history.
            </P>
          </Section>

          <Section id="your-rights" heading="5. Your Rights">
            <P>You may:</P>
            <Bullets
              items={[
                'Sign out at any time.',
                'Request deletion of your account and associated data by contacting our support team.',
              ]}
            />
          </Section>

          <Section id="changes-to-this-policy" heading="6. Changes to This Policy">
            <P>We may update this Privacy Policy from time to time.</P>
            <P>The latest version will always be available on this page.</P>
          </Section>

          <Section id="contact" heading="7. Contact">
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
                <dd className="text-fluid-body">
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="font-medium text-primary-500 underline underline-offset-4 hover:text-primary-600 dark:hover:text-primary-400"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Website</dt>
                <dd className="text-fluid-body">
                  <a
                    href={SITE_URL}
                    className="font-medium text-primary-500 underline underline-offset-4 hover:text-primary-600 dark:hover:text-primary-400"
                  >
                    {SITE_URL}
                  </a>
                </dd>
              </div>
            </dl>
          </Section>
        </div>
      </main>
    </div>
  )
}
