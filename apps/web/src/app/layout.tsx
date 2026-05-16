import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

export const metadata: Metadata = {
  title: "Manuals",
  description: "Professional project manuals platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var mode = localStorage.getItem("manuals.theme") || "system";
                  var resolved = mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : mode === "dark" ? "dark" : "light";
                  document.documentElement.dataset.themeMode = mode;
                  document.documentElement.dataset.theme = resolved;
                  document.documentElement.style.colorScheme = resolved;
                } catch (_) {
                  document.documentElement.dataset.themeMode = "system";
                  document.documentElement.dataset.theme = "light";
                }
              })();
            `
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
