import { productionIssues } from "@/lib/production-config";
import { rows } from "@/db/sqlite";
export const dynamic = "force-dynamic";
export async function GET() {
  if (productionIssues().length) return Response.json({ status: "unconfigured" }, { status: 503 });
  try {
    rows("SELECT 1");
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
