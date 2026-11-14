import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tools, ToolError } from "@/lib/agent-tools";
import { currentStock } from "@/lib/queries";


export const dynamic = "force-dynamic";

const errorShape = (code: string, message: string) => ({ error: { code, message } });

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("upsert"), args: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal("update_count"), args: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal("reduce"), args: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal("delete"), args: z.record(z.string(), z.unknown()) }),
]);

export async function GET() {
  return Response.json(await currentStock());
}

export async function POST(req: NextRequest) {
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(errorShape("bad_request", "action and args required"), { status: 400 });
  }
  const { action, args } = parsed.data;
  try {
    switch (action) {
      case "upsert": return Response.json(await tools.upsert_stock.run(args as never));
      case "update_count": return Response.json(await tools.update_stock_count.run(args as never));
      case "reduce": return Response.json(await tools.reduce_stock.run(args as never));
      case "delete": return Response.json(await tools.delete_stock.run(args as never));
    }
  } catch (e) {
    if (e instanceof ToolError) return NextResponse.json(errorShape(e.code, e.message), { status: 409 });
    if (e instanceof z.ZodError) return NextResponse.json(errorShape("validation", "invalid args"), { status: 400 });
    throw e;
  }
}
