export default function ShopCustomersLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex items-center gap-3 rounded-full border border-white/20 bg-white/60 px-5 py-3 text-slate-700 shadow-sm dark:border-white/10 dark:bg-black/30 dark:text-zinc-200">
        <span className="h-4 w-4 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
        <span className="text-sm font-medium">Cargando clientes...</span>
      </div>
    </div>
  );
}
