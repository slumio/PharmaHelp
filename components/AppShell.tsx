"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Avatar, Box, Button, Chip, Drawer, IconButton, Stack, Typography } from "@mui/material";
import { LocalPharmacyRounded, DashboardRounded, Inventory2Outlined, GridViewRounded, ReceiptLongOutlined, FileUploadOutlined, AutoAwesomeRounded, MenuRounded, HelpOutlineRounded, ArrowForwardRounded } from "@mui/icons-material";
const links = [
  { href: "/", label: "Overview", Icon: DashboardRounded },
  { href: "/inventory", label: "Inventory", Icon: Inventory2Outlined },
  { href: "/shelves", label: "Shelf map", Icon: GridViewRounded },
  { href: "/bills", label: "Customer bills", Icon: ReceiptLongOutlined },
  { href: "/import", label: "Import stock", Icon: FileUploadOutlined },
  { href: "/ask", label: "Ask your store", Icon: AutoAwesomeRounded },
];
export default function AppShell({ children, demo = false }: { children: React.ReactNode; demo?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const current = links.find(link => link.href === path);
  const navigation = <Box sx={{ height: "100%", display: "flex", flexDirection: "column", p: 2.5, bgcolor: "#172020", color: "#b7c3bf" }}>
    <Stack component={Link} href="/" direction="row" spacing={1.3} sx={{ alignItems: "center", textDecoration: "none", px: 1, pt: 1, pb: 4 }}>
      <Box sx={{ bgcolor: "#4a9dff", color: "#132327", borderRadius: 0, p: .8, display: "flex" }}><LocalPharmacyRounded /></Box>
      <Box><Typography sx={{ fontSize: 22, letterSpacing: -.7, fontWeight: 750, color: "text.primary" }}>PharmaHelp<span style={{ color: "#4a9dff" }}>.</span></Typography><Typography sx={{ fontSize: 10, letterSpacing: 1.8, color: "#889d99" }}>YOUR STORE, CONNECTED</Typography></Box>
    </Stack>
    <Typography sx={{ px: 1.5, mb: 1.5, fontSize: 10, letterSpacing: 1.5, color: "#769590" }}>WORKSPACE</Typography>
    <Stack component="nav" aria-label="Main navigation" spacing={.7}>
      {links.map(({ href, label, Icon }) => <Button key={href} component={Link} href={href} onClick={() => setOpen(false)} startIcon={<Icon sx={{ fontSize: 20 }} />} aria-current={path === href ? "page" : undefined} sx={{ justifyContent: "flex-start", color: path === href ? "#e8e4d9" : "#a4b5b0", bgcolor: path === href ? "#26383e" : "transparent", px: 1.8, py: 1.4, fontSize: 13, "&:hover": { bgcolor: "#26383e", color: "text.primary" } }}>{label}{href === "/ask" && <Chip label="VOICE" size="small" sx={{ ml: "auto", height: 18, fontSize: 8, bgcolor: "#4a9dff", color: "#12222b", borderRadius: 0 }} />}</Button>)}
    </Stack>
    <Box sx={{ mt: "auto", pt: 5 }}>
      <Box sx={{ p: 2, border: "1px solid #3b4e4e", borderRadius: 0, background: "linear-gradient(135deg, #2b3d46, #1a292e)" }}><AutoAwesomeRounded sx={{ color: "#65aaff", fontSize: 23, mb: 1 }} /><Typography sx={{ color: "text.primary", fontSize: 13, fontWeight: 600 }}>A little help. A lot of clarity.</Typography><Typography sx={{ fontSize: 11, color: "#a2b4b2", mt: .6, mb: 1.5 }}>Ask about your stock, sales, or where a medicine is kept.</Typography><Button component={Link} href="/ask" onClick={() => setOpen(false)} endIcon={<ArrowForwardRounded />} size="small" sx={{ color: "#91bfff", px: 0, fontSize: 12 }}>Meet your copilot</Button></Box>
      <Stack direction="row" spacing={1.2} sx={{ alignItems: "center",  borderTop: "1px solid #354545", mt: 3, pt: 2.5 }}><Avatar sx={{ bgcolor: "#314c5c", width: 34, height: 34, fontSize: 12 }}>PH</Avatar><Box><Typography sx={{ color: "#d5dcd3", fontSize: 12, fontWeight: 600 }}>My pharmacy</Typography><Typography sx={{ color: "#889d99", fontSize: 10 }}>Store workspace</Typography></Box></Stack>
    </Box>
  </Box>;
  if (path === "/login") return <>{children}</>;
  return <Box sx={{ minHeight: "100vh" }}>
    <Box component="a" href="#main-content" sx={{ position: "fixed", top: -80, left: 12, zIndex: 1500, p: 2, bgcolor: "background.paper", "&:focus": { top: 10 } }}>Skip to content</Box>
    <Box sx={{ width: 246, position: "fixed", inset: "0 auto 0 0", display: { xs: "none", lg: "block" } }}>{navigation}</Box>
    <Drawer open={open} onClose={() => setOpen(false)} sx={{ "& .MuiDrawer-paper": { width: 260 } }}>{navigation}</Drawer>
    <Box sx={{ ml: { lg: "246px" } }}>
      <Stack component="header" direction="row" sx={{ alignItems: "center", justifyContent: "space-between",  height: 76, px: { xs: 2, md: 4 }, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center",  }}><IconButton aria-label="Open navigation" onClick={() => setOpen(true)} sx={{ display: { lg: "none" } }}><MenuRounded /></IconButton><Typography sx={{ color: "text.secondary", fontSize: 12 }}>Workspace <span style={{ margin: "0 10px", color: "#637573" }}>/</span> <strong style={{ color: "#e8e4d9", fontWeight: 600 }}>{current?.label ?? "PharmaHelp"}</strong></Typography></Stack>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center",  }}><Chip label="Pharmacy workspace" size="small" variant="outlined" sx={{ display: { xs: "none", sm: "flex" }, fontSize: 10, borderColor: "#394747" }} /><IconButton component={Link} href="/ask" aria-label="Get store help" size="small"><HelpOutlineRounded sx={{ fontSize: 20 }} /></IconButton><Button size="small" sx={{ fontSize: 11 }} onClick={async () => { await fetch("/api/auth", { method: "DELETE" }); window.location.assign("/login"); }}>Sign out</Button><Avatar sx={{ bgcolor: "#2c3c40", color: "#a5c5dd", fontSize: 12, width: 33, height: 33 }}>PH</Avatar></Stack>
      </Stack>
      {demo && <Box sx={{ bgcolor: "#293c4b", color: "#b8d3ef", px: 3, py: 1, borderBottom: "1px solid #46617a", fontSize: 11, fontFamily: '"Chivo Mono", monospace' }}>DEMO / Fictional sample data · Read-only preview · Connect MongoDB to use your own store.</Box>}
      <Box component="main" id="main-content" sx={{ p: { xs: 2, sm: 3, xl: 4 }, maxWidth: 1560, mx: "auto", minWidth: 0 }}>{children}</Box>
      <Stack component="footer" direction="row" sx={{ justifyContent: "space-between",  px: { xs: 2, sm: 3, xl: 4 }, py: 3, color: "#849590", fontSize: 10 }}><span>PharmaHelp · A clearer day at your pharmacy.</span><span>Made for everyday care</span></Stack>
    </Box>
  </Box>;
}
