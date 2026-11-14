import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/instrument-sans/700.css";
import "@fontsource/chivo-mono/400.css";
import "./globals.css";
import type { Metadata } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import Theme from "@/components/Theme";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "PharmaHelp — Your pharmacy, connected", description: "A clearer day at your pharmacy. Inventory, bills, shelves and your voice copilot in one workspace." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppRouterCacheProvider>
          <Theme>
            <AppShell>{children}</AppShell>
          </Theme>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
