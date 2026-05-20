export default function DashboardSectionLoading() {
  return (
    <div className="relative min-h-[52vh] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
      <div className="h-10 w-10 rounded-full border border-white/30 dark:border-white/15 bg-white/20 dark:bg-white/5 backdrop-blur-sm animate-[dashboardSoftPulse_0.9s_ease-in-out_infinite]" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_30%_at_50%_18%,rgba(255,255,255,0.18),transparent_65%)] dark:bg-[radial-gradient(60%_30%_at_50%_18%,rgba(255,255,255,0.08),transparent_65%)]" />
      <style>{`
        @keyframes dashboardSoftPulse {
          0%, 100% { opacity: 0.25; transform: scale(0.92); }
          50% { opacity: 0.48; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
