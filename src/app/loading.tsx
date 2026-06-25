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
        <div className="bg-primary-500/20 rounded-3xl p-6 h-32" />

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
