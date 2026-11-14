import { rateLimit } from "@/lib/rate-limit";
import { prepareAction, mutationTools, type ProposedAction } from "@/lib/agent-actions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tools, ToolError } from "@/lib/agent-tools";
import { STORE_ID, currentStock } from "@/lib/queries";
import { run as sqlRun, STORE_ID as AUDIT_STORE_ID } from "@/db/sqlite";
import { openai } from "@ai-sdk/openai";
import { generateText, tool, stepCountIs } from "ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ question: z.string().min(1).max(500), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(8).default([]) });

const errorShape = (code: string, message: string) => ({
  error: { code, message },
});

export async function GET() {
  return NextResponse.json({
    tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description })),
  });
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit("agent", 30, 60);
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(errorShape("bad_request", "question is required"), { status: 400 });
  }
  const question = parsed.data.question;
  const toolCalls: { tool: string; args: unknown; result: unknown }[] = [];
  const actions: ProposedAction[] = [];
  let model = "rule-router";

  try {
    if (process.env.OPENAI_API_KEY) {
      model = "gpt-4o-mini";
      const { text, steps } = await generateText({
        model: openai("gpt-4o-mini"),
        system:
          "You are a pharmacy operations copilot. Answer only using tool results; never invent numbers. " +
          "Be brief, with figures in Indian rupees. When asked to change stock or create a sale, use a mutation tool to prepare a proposal. The tool never writes immediately. Explain that the user must confirm the action card before it is saved. Search to identify medicine IDs and batch details first; ask for clarification when ambiguous. Never say a proposed action is already complete.",
        messages: [...parsed.data.history, { role: "user", content: question }],
        tools: Object.fromEntries(
          Object.entries(tools).map(([name, t]) => [
            name,
            tool({ description: t.description, inputSchema: t.schema, execute: async (args) => { if (mutationTools.has(name)) { const action = await prepareAction(name, args); actions.push(action); return { requiresConfirmation: true, action }; } return t.run(args as never); } }),
          ]),
        ),
        stopWhen: stepCountIs(4),
      });
      for (const step of steps) {
        for (const tr of step.toolResults ?? []) {
          toolCalls.push({ tool: tr.toolName, args: tr.input, result: tr.output });
        }
      }
      sqlRun("INSERT INTO agent_runs(store_id,question,tool_calls,answer,model) VALUES(?,?,?,?,?)", [AUDIT_STORE_ID,question,JSON.stringify(toolCalls),text,model]);
      return NextResponse.json({ answer: text, toolCalls, model, actions });
    }

    // Deterministic rule-router fallback (works without an API key): keyword-matched
    // tool call, real records, answer phrased from computed rows — never invented numbers.
    const q = question.toLowerCase();
    let answer = "";
    const run = async (name: string, args: unknown) => {
      const result = await tools[name].run(args as never);
      toolCalls.push({ tool: name, args, result });
      return result as Record<string, unknown>[];
    };
    const rs = (n: number) => n.toLocaleString("en-IN");

    const addMatch = question.match(/^add\s+(\d+)\s+(?:of\s+)?(.+?)\s+at\s+(?:mrp\s+)?(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)\s*$/i);
    const reduceMatch = question.match(/^reduce\s+(\d+)\s+(?:of\s+)?(.+?)\s*$/i);
    const countMatch = question.match(/^set stock of\s+(.+?)\s+to\s+(\d+)\s*$/i);
    const deleteMatch = question.match(/^(?:delete|remove)(?: all)? stock of\s+(.+?)\s*$/i);
    const saleMatch = question.match(/^sell\s+(\d+)\s+(?:of\s+)?(.+?)\s+to\s+(.+?)\s*$/i);
    if (addMatch) {
      const name = addMatch[2].trim();
      const matches = await currentStock(name, 10);
      if (matches.length > 1) answer = "Several batches match. Use the inventory form to choose a specific batch, or enable AI mode for a detailed request.";
      else {
        const med = matches[0];
        actions.push(await prepareAction("upsert_stock", { name: med?.name ?? name, packSize: med?.pack_size ?? "strip", batchNo: med?.batch_no ?? "NA", qty: Number(addMatch[1]), mrp: Number(addMatch[3]) }));
        answer = "Stock addition prepared. Review the quantity, batch and price below, then confirm to save it.";
      }
    } else if (reduceMatch || countMatch || deleteMatch || saleMatch) {
      const name = (reduceMatch?.[2] ?? countMatch?.[1] ?? deleteMatch?.[1] ?? saleMatch?.[2] ?? "").trim();
      const matches = await currentStock(name, 10);
      if (matches.length !== 1) answer = matches.length ? "More than one batch matches. Please use the inventory form to choose the exact batch." : `No stocked medicine matches "${name}".`;
      else {
        const med = matches[0];
        const toolName = reduceMatch ? "reduce_stock" : countMatch ? "update_stock_count" : deleteMatch ? "delete_stock" : "create_order";
        const args = reduceMatch ? { medicineId: med.medicine_id, qty: Number(reduceMatch[1]) } : countMatch ? { medicineId: med.medicine_id, countedQty: Number(countMatch[2]) } : deleteMatch ? { medicineId: med.medicine_id } : { customerName: saleMatch![3], items: [{ medicineId: med.medicine_id, qty: Number(saleMatch![1]) }] };
        actions.push(await prepareAction(toolName, args));
        answer = `Prepared a change for ${med.name}, batch ${med.batch_no}. Review the action below and confirm to save it.`;
      }
    } else if (/expir/.test(q)) {
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
      const rows = await run("search_medicines", { query: question.replace(/^(how much stock is left of|how much stock of|stock of|how much|stock|left|kitna)\s*/i, "").replace(/\?$/, "").trim().slice(0, 40), limit: 5 });
      answer = rows.length
        ? rows.map((r) => `${r.name}: ${r.stock} in stock, MRP ₹${r.mrp}, expiry ${r.expiry_date}.`).join(" ")
        : "No matching medicine found.";
    } else {
      const m = (await run("get_dashboard_metrics", {})) as unknown as Record<string, unknown>;
      answer = `Today: revenue ₹${rs(Number(m.todayRevenue))}, ${m.todayOrders} orders, udhaar ₹${rs(Number(m.creditOutstanding))}, ${m.lowStockCount} low-stock items. Ask me about expiry, low stock, where a medicine is kept, or a medicine's stock.`;
    }

    sqlRun("INSERT INTO agent_runs(store_id,question,tool_calls,answer,model) VALUES(?,?,?,?,?)", [AUDIT_STORE_ID,question,JSON.stringify(toolCalls),answer,model]);
    return NextResponse.json({ answer, toolCalls, model, actions });
  } catch (e) {
    if (e instanceof ToolError) {
      return NextResponse.json(errorShape(e.code, e.message), { status: 409 });
    }
    if (e instanceof z.ZodError) return NextResponse.json(errorShape("validation", "Please check the quantity, price, and required action details."), { status: 400 });
    console.error(e);
    return NextResponse.json(errorShape("internal", "agent failed"), { status: 500 });
  }
}
