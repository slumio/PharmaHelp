"use client";

import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

const theme = createTheme({
  palette: {
    mode: "light",
    background: { default: "#f7f5f0", paper: "#ffffff" },
    primary: { main: "#12945f", dark: "#0a5f3d", light: "#d6f2e3" },
    secondary: { main: "#1c2b27" },
  },
  typography: { fontFamily: "var(--font-inter), system-ui, sans-serif" },
  components: {
    MuiPaper: { styleOverrides: { root: { borderRadius: 14 } } },
    MuiTableCell: { styleOverrides: { root: { fontVariantNumeric: "tabular-nums" } } },
  },
});

export default function Theme({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
