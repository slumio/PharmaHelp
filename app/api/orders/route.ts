import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { STORE_ID } from "@/lib/queries";
import { createOrderTx, ToolError } from "@/lib/agent-tools";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.execute(sql`
    SELECT o.id, o.invoice_no, o.customer_name, o.total, o.paid, (o.total - o.paid) AS credit_due, o.created_at,
           (SELECT json_agg(json_build_object('name', name_snapshot, 'qty', qty, 'lineTotal', line_total))
            FROM order_items WHERE order_id = o.id) AS items
    FROM orders o WHERE o.store_id = ${STORE_ID} ORDER BY o.created_at DESC LIMIT 50`);
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const result = await createOrderTx(body?.customerName, body?.customerPhone, body?.paid, body?.items);
    return Response.json(result);
  } catch (e) {
    if (e instanceof ToolError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 409 });
    throw e;
  }
}
