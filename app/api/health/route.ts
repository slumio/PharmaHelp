import { DEMO_MODE } from "@/lib/demo";
import { database } from "@/db/mongo";
export const dynamic = "force-dynamic";
export async function GET() {
  if (DEMO_MODE) return Response.json({ status: "ok", mode: "demo" });
  try {
    await (await database()).command({ ping: 1 });
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
