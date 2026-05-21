type DashboardGlassLoadingProps = {
  compact?: boolean;
};

export default function DashboardGlassLoading({ compact = false }: DashboardGlassLoadingProps) {
  return (
    <div className={`relative ${compact ? "min-h-[46vh]" : "min-h-[80vh]"} flex items-center justify-center p-4 sm:p-6 pointer-events-none`}>
      <div className="absolute inset-0 overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md dark:bg-black/5">
        <div className="absolute -left-24 -top-20 h-60 w-60 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/15" />
        <div className="absolute -right-16 bottom-[-4rem] h-72 w-72 rounded-full bg-cyan-200/20 blur-3xl dark:bg-cyan-500/15" />
        <div className="absolute left-1/3 top-1/2 h-44 w-44 -translate-y-1/2 rounded-full bg-white/20 blur-3xl dark:bg-white/10" />
      </div>

      <div className="relative z-10 grid h-24 w-24 place-items-center rounded-full border border-white/20 bg-white/20 backdrop-blur-sm dark:border-white/10 dark:bg-black/20">
        <span className="absolute h-16 w-16 rounded-full border border-white/40 dark:border-white/25 animate-[dashRingPulse_1.35s_ease-in-out_infinite]" />
        <span className="absolute h-11 w-11 rounded-full border border-[#0071E3]/45 dark:border-[#5fb2ff]/40 animate-[dashRingPulse_1.35s_ease-in-out_infinite_140ms]" />
        <span className="h-2 w-2 rounded-full border border-white/70 dark:border-white/55" />
      </div>

      <style>{`
        @keyframes dashRingPulse {
          0%, 100% { opacity: 0.42; transform: scale(0.96); }
          50% { opacity: 0.95; transform: scale(1.04); }
        }
      `}</style>
    </div>
  );
}
