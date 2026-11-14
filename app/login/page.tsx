"use client";
import { useState } from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import { ArrowForwardRounded, LocalPharmacyRounded, AutoAwesomeRounded } from "@mui/icons-material";
export default function Login() {
  const [username, setUsername] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit() {
    if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }); const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Sign-in failed");
      const target = new URLSearchParams(window.location.search).get("next"); window.location.assign(target?.startsWith("/") && !target.startsWith("//") ? target : "/");
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <Box sx={{ minHeight: "100vh", display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, bgcolor: "background.paper" }}>
    <Stack sx={{ display: { xs: "none", md: "flex" }, bgcolor: "#3285e3", color: "text.primary", p: 7, justifyContent: "space-between", position: "relative", overflow: "hidden" }}><Stack direction="row" spacing={1.2} sx={{ alignItems: "center" }}><LocalPharmacyRounded sx={{ color: "#e8e4d9", fontSize: 32 }} /><Typography sx={{ fontSize: 25, fontWeight: 700 }}>PharmaHelp.</Typography></Stack><Box sx={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", border: "70px solid #559be9", right: -250, bottom: 10, opacity: .6 }} /><Box sx={{ position: "relative", maxWidth: 400, my: 8 }}><AutoAwesomeRounded sx={{ color: "#f0ede6", fontSize: 36, mb: 3 }} /><Typography sx={{ fontSize: { md: 42, xl: 52 }, lineHeight: 1.15, letterSpacing: -2, fontWeight: 650 }}>A clearer day.<br />A healthier store.</Typography><Typography sx={{ color: "#d8e2e5", fontSize: 14, lineHeight: 1.9, mt: 3 }}>From the first delivery to the last sale, a little help keeping everything in its place.</Typography></Box><Typography sx={{ fontSize: 11, color: "#c7dce4" }}>YOUR STORE, CONNECTED.</Typography></Stack>
    <Stack sx={{ justifyContent: "center", maxWidth: 480, width: "100%", mx: "auto", p: { xs: 3, sm: 6 } }}><Typography sx={{ color: "primary.main", fontSize: 12, letterSpacing: 1.5, mb: 2 }}>WELCOME TO PHARMAHELP</Typography><Typography variant="h4">Good to have you here.</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 4 }}>Sign in to your pharmacy workspace.</Typography><Stack component="form" spacing={2.5} onSubmit={e => { e.preventDefault(); void submit(); }}>{error && <Alert severity="error">{error}</Alert>}<TextField label="Username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required slotProps={{ htmlInput: { maxLength: 200 } }} /><TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required slotProps={{ htmlInput: { maxLength: 500 } }} /><Button type="submit" variant="contained" endIcon={<ArrowForwardRounded />} disabled={busy} sx={{ py: 1.5 }}>{busy ? "Signing in…" : "Open my workspace"}</Button></Stack><Typography sx={{ fontSize: 11, color: "text.secondary", mt: 3, lineHeight: 1.8 }}>Use the operator credentials configured by your store administrator.</Typography></Stack>
  </Box>;
}
