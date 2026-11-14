import { productionIssues } from "@/lib/production-config";
import { correctOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { validSession, SESSION_COOKIE } from "@/lib/session";
export async function middleware(req: NextRequest) {
  const issues = productionIssues();
  if (issues.length) return NextResponse.json({ error: { code: "unconfigured", message: "Production configuration is incomplete.", issues } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const user = process.env.APP_USERNAME, password = process.env.APP_PASSWORD;
  if (!user || !password) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: { code: "unconfigured", message: "Configure application credentials" } }, { status: 503 });
    return NextResponse.next();
  }
  if (!await validSession(req.cookies.get(SESSION_COOKIE)?.value)) {
    if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "unauthorized", message: "Sign in to continue" } }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const login = new URL("/login", req.url); login.searchParams.set("next", req.nextUrl.pathname); return NextResponse.redirect(login);
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (!correctOrigin(req)) return NextResponse.json({ error: { code: "forbidden", message: "Invalid request origin" } }, { status: 403 });
    if (Number(req.headers.get("content-length")) > 8 * 1024 * 1024) return NextResponse.json({ error: { code: "too_large", message: "Request exceeds 8 MB" } }, { status: 413 });
  }
  const response = NextResponse.next(); response.headers.set("X-Content-Type-Options", "nosniff"); response.headers.set("X-Frame-Options", "DENY"); response.headers.set("Referrer-Policy", "same-origin");
  if (req.nextUrl.pathname.startsWith("/api/")) response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/auth|login).*)"] };
