type StatePanelProps = {
  title: string;
  description: string;
  variant?: "empty" | "error";
};

export function StatePanel({ title, description, variant = "empty" }: StatePanelProps) {
  const tone =
    variant === "error"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : "border-zinc-200 bg-zinc-50 text-zinc-900";

  return (
    <div className={`rounded-2xl border p-6 text-center ${tone}`} role={variant === "error" ? "alert" : "status"}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-80">{description}</p>
    </div>
  );
}
