function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/10 dark:bg-white/[0.04] ${className}`}>
      <div className="absolute left-4 right-10 top-4 h-2 rounded-full bg-white/30 dark:bg-white/20" />
      <div className="absolute left-4 right-20 top-8 h-2 rounded-full bg-white/20 dark:bg-white/10" />
      <div className="absolute -left-1/3 top-0 h-full w-1/3 animate-[glassSweep_1.15s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent dark:via-white/10" />
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="relative w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 dark:bg-black/5 backdrop-blur-md">
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3 lg:p-8">
          <SkeletonCard className="h-36 sm:col-span-2" />
          <SkeletonCard className="h-36" />
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
        </div>
      </div>

      <style>{`
        @keyframes glassSweep {
          0% { transform: translateX(0%); opacity: 0; }
          20% { opacity: 0.7; }
          100% { transform: translateX(420%); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
