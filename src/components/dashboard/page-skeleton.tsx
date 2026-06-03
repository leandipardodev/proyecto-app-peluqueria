export default function PageSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-full bg-white/30 dark:bg-white/10" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-3xl bg-white/20 dark:bg-black/20" />
        ))}
      </div>
      <div className="h-64 rounded-3xl bg-white/20 dark:bg-black/20" />
      <div className="h-48 rounded-3xl bg-white/20 dark:bg-black/20" />
    </div>
  );
}
