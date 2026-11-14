import { productionIssues } from "@/lib/production-config";
import { rows } from "@/db/sqlite";
export const dynamic = "force-dynamic";
export async function GET() {
  const issues = productionIssues();
  if (issues.length) return Response.json({ status: "unconfigured", issues, revision: process.env.RENDER_GIT_COMMIT ?? null }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    rows("SELECT 1");
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable", message: "SQLite could not be opened. Verify DATABASE_PATH and persistent disk permissions." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
