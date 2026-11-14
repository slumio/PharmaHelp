import { NextRequest } from "next/server";
import { z } from "zod";
import { executeAction } from "@/lib/agent-actions";
import { ToolError } from "@/lib/agent-tools";
export const runtime = "nodejs";
const Body = z.object({ id: z.uuid(), approved: z.literal(true) });
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "validation", message: "An action ID and explicit approval are required" } }, { status: 400 });
  try { return Response.json(await executeAction(parsed.data.id)); }
  catch (error) {
    if (error instanceof ToolError) return Response.json({ error: { code: error.code, message: error.message } }, { status: 409 });
    console.error("Action confirmation failed", error);
    return Response.json({ error: { code: "internal", message: "The action was not saved. You can safely retry." } }, { status: 500 });
  }
}
