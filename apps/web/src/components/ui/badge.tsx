import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  published: "border-emerald-200 bg-emerald-50 text-emerald-700",
  draft: "border-amber-200 bg-amber-50 text-amber-700",
  in_review: "border-sky-200 bg-sky-50 text-sky-700",
  approved: "border-violet-200 bg-violet-50 text-violet-700",
  archived: "border-slate-200 bg-slate-100 text-slate-600",
  public: "border-emerald-200 bg-emerald-50 text-emerald-700",
  internal: "border-sky-200 bg-sky-50 text-sky-700",
  private: "border-slate-200 bg-slate-100 text-slate-700",
  restricted: "border-rose-200 bg-rose-50 text-rose-700"
};

export function Badge({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", tones[value] ?? tones.private, className)}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
