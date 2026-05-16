"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";

const options = [
  { mode: "light" as const, label: "Light", icon: Sun },
  { mode: "dark" as const, label: "Dark", icon: Moon },
  { mode: "system" as const, label: "System", icon: Monitor }
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();

  return (
    <div className="inline-flex h-10 items-center rounded-md border border-line bg-white p-1 shadow-sm" aria-label="Theme mode">
      {options.map((option) => {
        const Icon = option.icon;
        const active = mode === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            aria-label={option.label}
            aria-pressed={active}
            title={option.label}
            onClick={() => setMode(option.mode)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 ${active ? "bg-slate-950 text-white hover:bg-slate-950 hover:text-white" : ""}`}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}
