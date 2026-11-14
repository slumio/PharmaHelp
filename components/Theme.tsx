"use client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
const theme = createTheme({
  palette: { mode: "dark", background: { default: "#1a2424", paper: "#202a2a" }, primary: { main: "#4a9dff", dark: "#2679da", light: "#253a47" }, secondary: { main: "#94b9df" }, text: { primary: "#e8e4d9", secondary: "#99aaa8" }, divider: "#394747", warning: { main: "#bf7a18" } },
  shape: { borderRadius: 0 },
  typography: { fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif', h4: { fontWeight: 500, letterSpacing: "-1px" }, h5: { fontWeight: 500, letterSpacing: "-.5px" }, h6: { fontSize: "1.05rem", fontWeight: 500 }, button: { textTransform: "none", fontWeight: 600 }, body2: { lineHeight: 1.7 } },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { WebkitFontSmoothing: "antialiased" }, "*": { boxSizing: "border-box" }, "a": { color: "inherit" }, ":focus-visible": { outline: "3px solid #83c7ac", outlineOffset: 3 } } },
    MuiCard: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: "1px solid #394747", boxShadow: "none" } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 0, padding: "11px 20px", fontFamily: '"Chivo Mono", monospace', fontSize: 11, clipPath: "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)" } } },
    MuiTextField: { defaultProps: { variant: "outlined" } },
    MuiOutlinedInput: { styleOverrides: { root: { background: "#202a2a", borderRadius: 0 } } },
    MuiTableCell: { styleOverrides: { root: { fontVariantNumeric: "tabular-nums", borderColor: "#354444", padding: "15px 18px" }, head: { background: "#263132", color: "#99aaa8", fontSize: 12, fontWeight: 600 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
  },
});
export default function Theme({ children }: { children: React.ReactNode }) { return <ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider>; }
