export default function BookingLoading() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-zinc-100 to-white dark:from-zinc-950 dark:to-black">
      <div className="flex-1 w-full max-w-7xl mx-auto flex flex-col lg:flex-row px-3 md:px-6 pt-6 pb-6 gap-4 lg:gap-8 animate-pulse">
        <div className="hidden lg:flex lg:w-[360px] xl:w-[400px] shrink-0 flex-col gap-4">
          <div className="h-48 bg-zinc-200 dark:bg-zinc-800 rounded-[2rem]" />
          <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-[2rem]" />
          <div className="h-64 bg-zinc-200 dark:bg-zinc-800 rounded-[2rem]" />
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          <div className="h-10 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto mb-6" />
          <div className="flex gap-2 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
            ))}
          </div>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 bg-zinc-200 dark:bg-zinc-800 rounded-3xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
