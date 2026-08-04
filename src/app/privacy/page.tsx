import type { Metadata } from 'next'
import Header from '@/components/Header'
import { OG_IMAGE, SITE_URL } from '@/components/landing/config'

// Public Privacy Policy required by the Google Play Console listing, so this
// route must stay statically renderable and reachable without auth: no session
// reads, no client data fetching. Header is the only client component here —
// it is what applies the `dark` class to <html> (Tailwind runs darkMode:'class',
// and nothing else on a directly-loaded legal page would light it up).
//
// Both languages are rendered into the same document rather than swapped by
// useTranslation(). The i18n store's getServerSnapshot() returns 'vi', so an
// i18n-driven page would ship Vietnamese-only HTML and reveal English only
// after hydration — the Play reviewer and any crawler fetching this URL without
// JS would never see the English text the listing is reviewed against. Emitting
// both keeps one URL, one page, and no dependency on client JS.

const PAGE_URL = `${SITE_URL}/privacy`
const TITLE = 'Privacy Policy — TappyAI'
const DESCRIPTION =
  'How TappyAI collects, uses, stores, and protects your information, including Google account data, conversation history, personalization, usage analytics, and the third-party providers we rely on. Available in English and Vietnamese.'

// Deliberately NOT the SUPPORT_EMAIL in landing/config.ts (a personal mailbox).
// support@tappyai.com is an active Cloudflare Email Routing rule forwarding to
// the owner, so it is the address the published policy and the Play Console
// entry commit to. config.ts's "no dedicated support@ mailbox yet" note is stale.
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

/* ------------------------------------------------------------------ content */

// Every statement below was verified against the production deployment before
// being published — env vars pulled from the Vercel production environment plus
// the route handlers that actually run. Notably PostHog is NOT documented: the
// earlier policy disclosed it, but NEXT_PUBLIC_POSTHOG_KEY is absent from the
// production environment and a full production page load issues zero requests
// to any PostHog host, so posthog.init() never runs. Analytics in production is
// first-party (POST /api/track -> Supabase `user_events`), which is what §1 and
// §2 describe instead.

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'lead'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'note'; text: string }
  | { kind: 'contact' }

interface PolicySection {
  slug: string
  heading: string
  blocks: Block[]
}

interface PolicyDoc {
  lang: 'en' | 'vi'
  /** Label for this document in the in-page language switch. */
  switchLabel: string
  title: string
  effective: string
  sections: PolicySection[]
  contactLabels: { email: string; website: string }
}

const EN: PolicyDoc = {
  lang: 'en',
  switchLabel: 'English',
  title: 'Privacy Policy',
  effective: 'Effective Date: August 2026',
  contactLabels: { email: 'Email', website: 'Website' },
  sections: [
    {
      slug: 'information-we-collect',
      heading: '1. Information We Collect',
      blocks: [
        { kind: 'lead', text: 'TappyAI may collect:' },
        {
          kind: 'bullets',
          items: [
            'Google account information (name, email address, profile photo) when you sign in with Google. TappyAI also supports signing in with Zalo.',
            'Conversation history with the AI assistant.',
            'Basic account information required to provide our services.',
            'Personalization details the assistant remembers from your conversations — such as the area you are usually in, who you go out with, your usual timing, your food, spa, shopping and entertainment preferences, and your budget ranges.',
            'Feedback you give on an AI reply (like, dislike, or report, with an optional reason).',
            'Booking details — your name and phone number — when you book a service through TappyAI.',
            'Approximate location. With your permission, your device coordinates are used to show results near you.',
            'Usage and device information — pages viewed, searches, the categories, places, deals and reviews you interact with, the features you use, plus device type, operating system, app version, language, a session identifier, and the country derived from your IP address.',
          ],
        },
        {
          kind: 'note',
          text: 'If you browse without signing in, usage events are recorded against a random anonymous identifier instead of an account.',
        },
      ],
    },
    {
      slug: 'how-we-use-your-information',
      heading: '2. How We Use Your Information',
      blocks: [
        { kind: 'lead', text: 'We use your information to:' },
        {
          kind: 'bullets',
          items: [
            'Provide AI-powered conversations.',
            'Save and restore your conversation history.',
            'Display your account profile.',
            'Personalize recommendations, based on what the assistant has remembered and on how you use the app.',
            'Confirm and manage bookings you make.',
            'Improve the quality and reliability of the service.',
            'Protect platform security.',
          ],
        },
        { kind: 'note', text: 'We do not sell your personal information.' },
      ],
    },
    {
      slug: 'third-party-services',
      heading: '3. Third-Party Services',
      blocks: [
        {
          kind: 'lead',
          text: 'To provide AI responses, search and other core features, TappyAI may send relevant user requests to trusted providers, including:',
        },
        {
          kind: 'bullets',
          items: [
            'Anthropic Claude — generates the assistant’s responses.',
            'Google search services and Serper — retrieve search and place results.',
            'Supabase — hosts our database, authentication and file storage.',
            'Vercel — hosts the website and stores the photos, video and audio you upload.',
            'OpenStreetMap Nominatim — turns coordinates into a place name when you share your location.',
            'Stripe — processes payment if you subscribe to a paid plan.',
            'Google and Zalo — handle sign-in when you choose those options.',
          ],
        },
        {
          kind: 'p',
          text: 'These providers process data according to their own privacy policies.',
        },
        {
          kind: 'p',
          text: 'If you turn on notifications, your browser or device also creates a push subscription, which we store in order to deliver those notifications.',
        },
      ],
    },
    {
      slug: 'data-storage-and-security',
      heading: '4. Data Storage and Security',
      blocks: [
        {
          kind: 'p',
          text: 'User data is securely stored using Supabase infrastructure with authentication and access controls. Photos, video and audio you upload are stored in Vercel Blob storage.',
        },
        {
          kind: 'p',
          text: 'Only authenticated users can access their own account information and conversation history.',
        },
      ],
    },
    {
      slug: 'your-rights',
      heading: '5. Your Rights',
      blocks: [
        { kind: 'lead', text: 'You may:' },
        {
          kind: 'bullets',
          items: [
            'Sign out at any time.',
            'Review, correct or delete what the assistant remembers about you, under Settings → Memory.',
            'Request deletion of your account and associated data by contacting our support team.',
          ],
        },
      ],
    },
    {
      slug: 'changes-to-this-policy',
      heading: '6. Changes to This Policy',
      blocks: [
        { kind: 'p', text: 'We may update this Privacy Policy from time to time.' },
        { kind: 'p', text: 'The latest version will always be available on this page.' },
      ],
    },
    {
      slug: 'contact',
      heading: '7. Contact',
      blocks: [{ kind: 'contact' }],
    },
  ],
}

const VI: PolicyDoc = {
  lang: 'vi',
  switchLabel: 'Tiếng Việt',
  title: 'Chính sách bảo mật',
  effective: 'Ngày hiệu lực: Tháng 8 năm 2026',
  contactLabels: { email: 'Email', website: 'Website' },
  sections: [
    {
      slug: 'thong-tin-thu-thap',
      heading: '1. Thông tin chúng tôi thu thập',
      blocks: [
        { kind: 'lead', text: 'TappyAI có thể thu thập:' },
        {
          kind: 'bullets',
          items: [
            'Thông tin tài khoản Google (tên, địa chỉ email, ảnh đại diện) khi bạn đăng nhập bằng Google. TappyAI cũng hỗ trợ đăng nhập bằng Zalo.',
            'Lịch sử trò chuyện với trợ lý AI.',
            'Thông tin tài khoản cơ bản cần thiết để cung cấp dịch vụ.',
            'Thông tin cá nhân hóa mà trợ lý ghi nhớ từ cuộc trò chuyện của bạn — ví dụ khu vực bạn thường ở, người bạn thường đi cùng, thời điểm bạn thường đi, sở thích về ăn uống, spa, mua sắm, giải trí và khoảng ngân sách của bạn.',
            'Phản hồi của bạn về một câu trả lời của AI (thích, không thích hoặc báo cáo, kèm lý do tùy chọn).',
            'Thông tin đặt chỗ — tên và số điện thoại của bạn — khi bạn đặt dịch vụ qua TappyAI.',
            'Vị trí tương đối. Khi bạn cho phép, tọa độ thiết bị của bạn được dùng để hiển thị kết quả ở gần bạn.',
            'Thông tin sử dụng và thiết bị — các trang bạn xem, nội dung bạn tìm kiếm, các danh mục, địa điểm, ưu đãi và bài đánh giá bạn tương tác, các tính năng bạn dùng, cùng với loại thiết bị, hệ điều hành, phiên bản ứng dụng, ngôn ngữ, mã phiên và quốc gia được xác định từ địa chỉ IP của bạn.',
          ],
        },
        {
          kind: 'note',
          text: 'Nếu bạn sử dụng mà không đăng nhập, các sự kiện sử dụng được ghi nhận theo một mã ẩn danh ngẫu nhiên thay vì theo tài khoản.',
        },
      ],
    },
    {
      slug: 'cach-su-dung-thong-tin',
      heading: '2. Cách chúng tôi sử dụng thông tin',
      blocks: [
        { kind: 'lead', text: 'Chúng tôi sử dụng thông tin của bạn để:' },
        {
          kind: 'bullets',
          items: [
            'Cung cấp các cuộc trò chuyện được hỗ trợ bởi AI.',
            'Lưu và khôi phục lịch sử trò chuyện của bạn.',
            'Hiển thị hồ sơ tài khoản của bạn.',
            'Cá nhân hóa gợi ý, dựa trên những gì trợ lý đã ghi nhớ và cách bạn sử dụng ứng dụng.',
            'Xác nhận và quản lý các đặt chỗ bạn thực hiện.',
            'Cải thiện chất lượng và độ tin cậy của dịch vụ.',
            'Bảo vệ an toàn của nền tảng.',
          ],
        },
        { kind: 'note', text: 'Chúng tôi không bán thông tin cá nhân của bạn.' },
      ],
    },
    {
      slug: 'dich-vu-ben-thu-ba',
      heading: '3. Dịch vụ bên thứ ba',
      blocks: [
        {
          kind: 'lead',
          text: 'Để cung cấp câu trả lời AI, tìm kiếm và các tính năng cốt lõi khác, TappyAI có thể gửi các yêu cầu liên quan của người dùng tới những nhà cung cấp đáng tin cậy, bao gồm:',
        },
        {
          kind: 'bullets',
          items: [
            'Anthropic Claude — tạo ra câu trả lời của trợ lý.',
            'Dịch vụ tìm kiếm của Google và Serper — lấy kết quả tìm kiếm và địa điểm.',
            'Supabase — lưu trữ cơ sở dữ liệu, xác thực và tệp của chúng tôi.',
            'Vercel — vận hành trang web và lưu trữ ảnh, video, âm thanh bạn tải lên.',
            'OpenStreetMap Nominatim — chuyển tọa độ thành tên địa điểm khi bạn chia sẻ vị trí.',
            'Stripe — xử lý thanh toán nếu bạn đăng ký gói trả phí.',
            'Google và Zalo — xử lý đăng nhập khi bạn chọn các phương thức đó.',
          ],
        },
        {
          kind: 'p',
          text: 'Các nhà cung cấp này xử lý dữ liệu theo chính sách bảo mật riêng của họ.',
        },
        {
          kind: 'p',
          text: 'Nếu bạn bật thông báo, trình duyệt hoặc thiết bị của bạn cũng tạo một đăng ký nhận thông báo đẩy, và chúng tôi lưu đăng ký đó để có thể gửi các thông báo này.',
        },
      ],
    },
    {
      slug: 'luu-tru-va-bao-mat',
      heading: '4. Lưu trữ và bảo mật dữ liệu',
      blocks: [
        {
          kind: 'p',
          text: 'Dữ liệu người dùng được lưu trữ an toàn trên hạ tầng Supabase với cơ chế xác thực và kiểm soát truy cập. Ảnh, video và âm thanh bạn tải lên được lưu trên Vercel Blob.',
        },
        {
          kind: 'p',
          text: 'Chỉ người dùng đã đăng nhập mới có thể truy cập thông tin tài khoản và lịch sử trò chuyện của chính mình.',
        },
      ],
    },
    {
      slug: 'quyen-cua-ban',
      heading: '5. Quyền của bạn',
      blocks: [
        { kind: 'lead', text: 'Bạn có thể:' },
        {
          kind: 'bullets',
          items: [
            'Đăng xuất bất kỳ lúc nào.',
            'Xem lại, chỉnh sửa hoặc xóa những gì trợ lý ghi nhớ về bạn, trong Cài đặt → Trí nhớ.',
            'Yêu cầu xóa tài khoản và dữ liệu liên quan bằng cách liên hệ đội ngũ hỗ trợ của chúng tôi.',
          ],
        },
      ],
    },
    {
      slug: 'thay-doi-chinh-sach',
      heading: '6. Thay đổi chính sách',
      blocks: [
        { kind: 'p', text: 'Chúng tôi có thể cập nhật Chính sách bảo mật này theo thời gian.' },
        { kind: 'p', text: 'Phiên bản mới nhất sẽ luôn có trên trang này.' },
      ],
    },
    {
      slug: 'lien-he',
      heading: '7. Liên hệ',
      blocks: [{ kind: 'contact' }],
    },
  ],
}

const DOCS = [EN, VI]

/* ---------------------------------------------------------------- rendering */

/** Policy body copy — one shared measure/leading for every paragraph. */
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-fluid-body text-gray-600 dark:text-gray-300">{children}</p>
}

/**
 * Bulleted list. The marker is a decorative span rather than a native
 * list-style dot so it can carry the brand accent colour and stay aligned with
 * the first line of wrapped items.
 */
function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-fluid-body text-gray-600 dark:text-gray-300">
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

function Contact({ labels }: { labels: PolicyDoc['contactLabels'] }) {
  const linkClass =
    'font-medium text-primary-500 underline underline-offset-4 hover:text-primary-600 dark:hover:text-primary-400 break-words'
  return (
    <dl className="space-y-4">
      <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{labels.email}</dt>
        <dd className="text-fluid-body">
          <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
            {SUPPORT_EMAIL}
          </a>
        </dd>
      </div>
      <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{labels.website}</dt>
        <dd className="text-fluid-body">
          <a href={SITE_URL} className={linkClass}>
            {SITE_URL}
          </a>
        </dd>
      </div>
    </dl>
  )
}

function renderBlock(block: Block, i: number, doc: PolicyDoc) {
  switch (block.kind) {
    case 'p':
    case 'lead':
      return <P key={i}>{block.text}</P>
    case 'bullets':
      return <Bullets key={i} items={block.items} />
    case 'note':
      return (
        <p key={i} className="text-fluid-body font-semibold text-gray-900 dark:text-white">
          {block.text}
        </p>
      )
    case 'contact':
      return <Contact key={i} labels={doc.contactLabels} />
  }
}

/**
 * One complete language edition. `lang` is set on the wrapper so screen readers
 * and translation tools switch pronunciation at the boundary, and section ids
 * are namespaced per language since both editions share one document.
 */
function PolicyEdition({ doc }: { doc: PolicyDoc }) {
  return (
    <article id={doc.lang} lang={doc.lang} className="scroll-mt-16">
      <header className="mb-8 sm:mb-10">
        <h2 className="text-fluid-display font-bold text-gray-900 dark:text-white">{doc.title}</h2>
        {/* Decorative accent rule — mirrors the marketing sections */}
        <span aria-hidden="true" className="mt-4 block h-1 w-12 rounded-full bg-accent-500" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{doc.effective}</p>
      </header>

      <div className="space-y-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10 sm:space-y-10 sm:p-8">
        {doc.sections.map((section) => {
          const headingId = `${doc.lang}-${section.slug}`
          return (
            <section
              key={section.slug}
              aria-labelledby={headingId}
              className="scroll-mt-20 space-y-3"
            >
              <h3
                id={headingId}
                className="text-fluid-h3 font-semibold text-gray-900 dark:text-white"
              >
                {section.heading}
              </h3>
              {section.blocks.map((block, i) => renderBlock(block, i, doc))}
            </section>
          )
        })}
      </div>
    </article>
  )
}

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950">
      <Header showBack backHref="/" />

      <main className="container-content py-10 sm:py-14">
        {/* The page carries one <h1>; each language edition is an <h2> beneath
            it, so the outline stays valid with two full documents present. */}
        <h1 className="sr-only">Privacy Policy — Chính sách bảo mật — TappyAI</h1>

        {/* Plain anchors, not a JS toggle: both editions stay in the document,
            so this works with JavaScript disabled and nothing is hidden from
            crawlers. */}
        <nav
          aria-label="Language"
          className="mb-8 flex flex-wrap items-center gap-2 text-sm"
        >
          {DOCS.map((doc) => (
            <a
              key={doc.lang}
              href={`#${doc.lang}`}
              lang={doc.lang}
              className="rounded-full border border-gray-200 bg-white px-4 py-1.5 font-medium text-gray-700 transition-colors hover:border-primary-500 hover:text-primary-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
            >
              {doc.switchLabel}
            </a>
          ))}
        </nav>

        <div className="space-y-14 sm:space-y-16">
          {DOCS.map((doc) => (
            <PolicyEdition key={doc.lang} doc={doc} />
          ))}
        </div>
      </main>
    </div>
  )
}
