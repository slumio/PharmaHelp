import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tools, ToolError } from "@/lib/agent-tools";
import { db, schema } from "@/db";
import { openai } from "@ai-sdk/openai";
import { generateText, tool } from "ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ question: z.string().min(1).max(500) });

const errorShape = (code: string, message: string) => ({
  error: { code, message },
});

export async function GET() {
  return NextResponse.json({
    tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description })),
  });
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(errorShape("bad_request", "question is required"), { status: 400 });
  }
  const question = parsed.data.question;
  const toolCalls: { tool: string; args: unknown; result: unknown }[] = [];
  let model = "rule-router";

  try {
    if (process.env.OPENAI_API_KEY) {
      model = "gpt-4o-mini";
      const { text, steps } = await generateText({
        model: openai("gpt-4o-mini"),
        system:
          "You are a pharmacy operations copilot. Answer only using tool results; never invent numbers. " +
          "Be brief, with figures in Indian rupees.",
        prompt: question,
        tools: Object.fromEntries(
          Object.entries(tools).map(([name, t]) => [
            name,
            tool({ description: t.description, parameters: t.schema, execute: (args) => t.run(args as never) }),
          ]),
        ),
        maxSteps: 4,
      });
      for (const step of steps) {
        for (const tr of step.toolResults ?? []) {
          toolCalls.push({ tool: tr.toolName, args: tr.args, result: tr.result });
        }
      }
      await db.insert(schema.agentRuns).values({ storeId: 1, question, toolCalls, answer: text, model });
      return NextResponse.json({ answer: text, toolCalls, model });
    }

    // Deterministic rule-router fallback (works without an API key): keyword-matched
    // tool call, real SQL, answer phrased from computed rows — never invented numbers.
    const q = question.toLowerCase();
    let answer = "";
    const run = async (name: string, args: unknown) => {
      const result = await tools[name].run(args as never);
      toolCalls.push({ tool: name, args, result });
      return result as Record<string, unknown>[];
    };
    const rs = (n: number) => n.toLocaleString("en-IN");

    if (/expir/.test(q)) {
      const rows = await run("get_expiring_stock", { days: 90 });
      const value = rows.reduce((s, r) => s + Number(r.value_at_risk), 0);
      answer = rows.length
        ? `${rows.length} medicines expire within 90 days — ₹${rs(value)} at purchase cost. Soonest: ${rows.slice(0, 5).map((r) => `${r.name} (${r.expiry_date})`).join(", ")}. Consider supplier returns or discounting.`
        : "No stock expires in the next 90 days.";
    } else if (/low|khatam|short|reorder/.test(q)) {
      const rows = await run("get_low_stock", {});
      answer = rows.length
        ? `${rows.length} items at or below minimum stock: ${rows.slice(0, 8).map((r) => `${r.name} (${r.qty} left)`).join(", ")}.`
        : "All items are above minimum stock.";
    } else if (/where|kahan|rack|shelf|kaha/.test(q)) {
      const match = question.match(/(?:where is|kahan hai|kaha hai)\s+([a-z0-9 .+-]+?)(?:\s+(?:kept|kept\?|stored|placed|rack)\??)?$/i);
      const query = (match ? match[1] : question.replace(/^(where is|kahan hai|kaha hai)\s+/i, ""))
        .replace(/\?/g, "").trim().slice(0, 40);
      const rows = await run("find_rack_location", { query });
      answer = rows.length
        ? rows.map((r) => `${r.name} is on rack ${r.rack_code ?? "?"}, row ${r.row_no}, column ${r.col_no}.`).join(" ")
        : `I couldn't find "${query}" in the store records.`;
    } else if (/today|revenue|aaj|udhaar|credit|pending/.test(q)) {
      const m = (await run("get_dashboard_metrics", {})) as unknown as Record<string, unknown>;
      const e90 = m.expiry90 as Record<string, unknown>;
      answer = `Today's revenue: ₹${rs(Number(m.todayRevenue))} across ${m.todayOrders} orders. Credit (udhaar) outstanding: ₹${rs(Number(m.creditOutstanding))}. ${m.lowStockCount} items low on stock; ₹${rs(Number(e90.value))} of stock expires within 90 days.`;
    } else if (/how much|stock|left|kitna|available/.test(q)) {
      const rows = await run("search_medicines", { query: question.replace(/[^A-Za-z0-9 +.-]/g, "").trim().slice(0, 40), limit: 5 });
      answer = rows.length
        ? rows.map((r) => `${r.name}: ${r.stock} in stock, MRP ₹${r.mrp}, expiry ${r.expiry_date}.`).join(" ")
        : "No matching medicine found.";
    } else {
      const m = (await run("get_dashboard_metrics", {})) as unknown as Record<string, unknown>;
      answer = `Today: revenue ₹${rs(Number(m.todayRevenue))}, ${m.todayOrders} orders, udhaar ₹${rs(Number(m.creditOutstanding))}, ${m.lowStockCount} low-stock items. Ask me about expiry, low stock, where a medicine is kept, or a medicine's stock.`;
    }

    await db.insert(schema.agentRuns).values({ storeId: 1, question, toolCalls, answer, model });
    return NextResponse.json({ answer, toolCalls, model });
  } catch (e) {
    if (e instanceof ToolError) {
      return NextResponse.json(errorShape(e.code, e.message), { status: 409 });
    }
    console.error(e);
    return NextResponse.json(errorShape("internal", "agent failed"), { status: 500 });
  }
}
