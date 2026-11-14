import { rateLimit } from "@/lib/rate-limit";
import { productionIssues } from "@/lib/production-config";
import { correctOrigin } from "@/lib/origin";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSession, SESSION_COOKIE } from "@/lib/session";
export const runtime = "nodejs";
function same(a: string, b: string) { return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest()); }

export async function POST(req: NextRequest) {
  if (!correctOrigin(req)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  if (productionIssues().length) return NextResponse.json({ error: "Production configuration is incomplete. Configure the required server secrets." }, { status: 503 });
  if (!process.env.APP_USERNAME || !process.env.APP_PASSWORD) return NextResponse.json({ error: "Configure APP_USERNAME and APP_PASSWORD on your host first." }, { status: 503 });
  if (Number(req.headers.get("content-length")) > 2048) return NextResponse.json({ error: "Invalid login" }, { status: 413 });
  const limited = await rateLimit("login", 30, 900);
  if (limited) return limited;
  const input = await req.json().catch(() => null);
  if (typeof input?.username !== "string" || typeof input?.password !== "string" || input.username.length > 200 || input.password.length > 500 || !same(input.username, process.env.APP_USERNAME) || !same(input.password, process.env.APP_PASSWORD)) return NextResponse.json({ error: "The username or password is incorrect." }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSession(), { httpOnly: true, secure: req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https", sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export async function DELETE(req: NextRequest) {
  if (!correctOrigin(req)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  const response = NextResponse.json({ ok: true }); response.cookies.delete(SESSION_COOKIE); return response;
}
