"use client";

import type React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const storageKey = "manuals.theme";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode: ThemeMode, resolvedTheme: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.themeMode = mode;
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    const initialMode: ThemeMode = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const initialResolved = initialMode === "system" ? getSystemTheme() : initialMode;
    setModeState(initialMode);
    setResolvedTheme(initialResolved);
    applyTheme(initialMode, initialResolved);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      setResolvedTheme((current) => {
        const next = mode === "system" ? getSystemTheme() : mode;
        if (next !== current) applyTheme(mode, next);
        return next;
      });
    };

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [mode]);

  function setMode(nextMode: ThemeMode) {
    const nextResolved = nextMode === "system" ? getSystemTheme() : nextMode;
    window.localStorage.setItem(storageKey, nextMode);
    setModeState(nextMode);
    setResolvedTheme(nextResolved);
    applyTheme(nextMode, nextResolved);
  }

  const value = useMemo(() => ({ mode, resolvedTheme, setMode }), [mode, resolvedTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider.");
  return context;
}
