const GRADIENTS = [
  "from-violet-400 to-violet-500 dark:from-violet-500 dark:to-violet-600",
  "from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-600",
  "from-sky-400 to-sky-500 dark:from-sky-500 dark:to-sky-600",
  "from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-600",
  "from-rose-400 to-rose-500 dark:from-rose-500 dark:to-rose-600",
  "from-cyan-400 to-cyan-500 dark:from-cyan-500 dark:to-cyan-600",
];

export function productColor(id: string): string {
  const hash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return GRADIENTS[hash % GRADIENTS.length];
}
