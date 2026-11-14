import type { Metadata } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import Theme from "@/components/Theme";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = { title: "Sharma Pharmacy Copilot" };

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
