// 🔑 This lives in the `(home)` route group, NOT at `src/app/`, and the move is load-bearing.
//
// At the app root it was the Suspense boundary for EVERY route, and a Suspense boundary above a
// page swallows that page's `notFound()`: the not-found UI rendered, but the response stayed
// HTTP 200. Measured — a deleted review, a malformed id, and a synchronous `notFound()` in a
// throwaway probe route all answered 200, while an unmatched URL (which renders no page at all)
// correctly answered 404. Moving this file into the group restored real 404s everywhere and
// changed nothing else measurable: TTFB was unchanged across `/`, `/reviews`, `/profile` and
// `/reviews/[id]`.
//
// It is also the only place the skeleton was ever right. It draws the HOME layout — header, hero,
// category grid — and used to be shown while `/reviews` (a black full-screen feed), `/profile` and
// every other route loaded. Scoped here it covers exactly the route it was drawn for, which is
// still an async server component (auth + memory) and so still wants it.
//
// 🚨 Do NOT move a `loading.tsx` back to `src/app/`. That single file decides whether `notFound()`
// can set a status code anywhere in the application.
export default function HomeLoading() {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-20 animate-pulse">
      {/* Header skeleton */}
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="w-24 h-6 bg-gray-200 dark:bg-gray-800 rounded-lg" />
          <div className="w-8 h-8 bg-gray-200 dark:bg-gray-800 rounded-full" />
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Hero skeleton */}
        <div className="bg-interactive/20 rounded-3xl p-6 h-32" />

        {/* Categories skeleton */}
        <section>
          <div className="w-40 h-5 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
          <div className="grid grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
                <div className="w-10 h-3 bg-gray-200 dark:bg-gray-800 rounded" />
              </div>
            ))}
          </div>
        </section>

        {/* Suggestions skeleton */}
        <section>
          <div className="w-28 h-5 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
          <div className="grid gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800" />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
