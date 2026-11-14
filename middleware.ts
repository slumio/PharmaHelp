import { correctOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { validSession, SESSION_COOKIE } from "@/lib/session";
export async function middleware(req: NextRequest) {
  const user = process.env.APP_USERNAME, password = process.env.APP_PASSWORD;
  if (!user || !password) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: { code: "unconfigured", message: "Configure application credentials" } }, { status: 503 });
    return NextResponse.next();
  }
  let basic = "";
  try { const header = req.headers.get("authorization") ?? ""; if (header.startsWith("Basic ")) basic = atob(header.slice(6)); } catch { /* Treat malformed credentials as absent. */ }
  if (basic !== `${user}:${password}` && !await validSession(req.cookies.get(SESSION_COOKIE)?.value)) {
    if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "unauthorized", message: "Sign in to continue" } }, { status: 401, headers: { "Cache-Control": "no-store", "WWW-Authenticate": 'Basic realm="PharmaHelp"' } });
    const login = new URL("/login", req.url); login.searchParams.set("next", req.nextUrl.pathname); return NextResponse.redirect(login);
  }
  if (process.env.DEMO_MODE === "true" && !["GET", "HEAD", "OPTIONS"].includes(req.method) && req.nextUrl.pathname !== "/api/agent") return NextResponse.json({ error: { code: "demo_readonly", message: "This is a sample-data preview. Connect MongoDB and disable DEMO_MODE to save changes." } }, { status: 409 });
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (!correctOrigin(req)) return NextResponse.json({ error: { code: "forbidden", message: "Invalid request origin" } }, { status: 403 });
    if (Number(req.headers.get("content-length")) > 8 * 1024 * 1024) return NextResponse.json({ error: { code: "too_large", message: "Request exceeds 8 MB" } }, { status: 413 });
  }
  const response = NextResponse.next(); response.headers.set("X-Content-Type-Options", "nosniff"); response.headers.set("X-Frame-Options", "DENY"); response.headers.set("Referrer-Policy", "same-origin");
  if (req.nextUrl.pathname.startsWith("/api/")) response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/auth|login).*)"] };
