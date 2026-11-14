"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import LocalPharmacyIcon from "@mui/icons-material/LocalPharmacy";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/ask", label: "Ask" },
  { href: "/shelves", label: "Shelf Map" },
  { href: "/inventory", label: "Inventory" },
  { href: "/bills", label: "Bills" },
  { href: "/import", label: "Import" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = LINKS.findIndex((l) => (l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)));
  return (
    <>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        <Toolbar sx={{ gap: 2, flexWrap: "wrap", minHeight: 64 }}>
          <LocalPharmacyIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 700, mr: 2 }}>
            Sharma Pharmacy Copilot
          </Typography>
          <Tabs
            value={current === -1 ? false : current}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 0, flex: 1, minWidth: 0, "& .MuiTab-root": { minHeight: 48, px: { xs: 1.5, sm: 2 } } }}
          >
            {LINKS.map((l) => (
              <Tab key={l.href} component={Link} href={l.href} label={l.label} />
            ))}
          </Tabs>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3, px: { xs: 1.5, sm: 3 } }}>
        {children}
      </Container>
    </>
  );
}
