export default function ShopAppointmentsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden p-4 sm:p-6">
        <div className="grid grid-cols-7 gap-px mb-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 py-3">
              <div className="h-3 w-10 bg-white/20 dark:bg-white/10 rounded-full" />
              <div className="h-7 w-7 bg-white/20 dark:bg-white/10 rounded-full" />
            </div>
          ))}
        </div>
        <div className="h-[400px] bg-white/10 dark:bg-white/[0.03] rounded-2xl" />
      </div>
    </div>
  );
}
