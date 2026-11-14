import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listOrders } from "@/lib/repository";
import { createOrderTx, ToolError } from "@/lib/agent-tools";

export const dynamic = "force-dynamic";

export async function GET() { return Response.json(await listOrders()); }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const result = await createOrderTx(body?.customerName, body?.customerPhone, body?.paid, body?.items);
    return Response.json(result);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: { code: "validation", message: "Invalid order" } }, { status: 400 });
    if (e instanceof ToolError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 409 });
    throw e;
  }
}
