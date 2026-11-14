import { NextRequest } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const maxDuration = 60;
const failure = (message: string, status: number) => Response.json({ error: { code: "speech", message } }, { status });
const Body = z.object({ text: z.string().trim().min(1).max(2000) });
export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) return failure("AI voice is not configured. Choose a device voice or configure OPENAI_API_KEY on the server.", 503);
  const limited = await rateLimit("speech", 20, 60);
  if (limited) return limited;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("Choose an answer under 2000 characters to read aloud.", 400);
  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_SPEECH_MODEL ?? "gpt-4o-mini-tts", voice: "coral", input: parsed.data.text, response_format: "mp3" }), signal: AbortSignal.timeout(45000),
    });
    if (!response.ok || !response.body) return failure("The AI voice service could not generate audio. Try a device voice.", 502);
    return new Response(response.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return failure("Speech generation timed out. Please try again.", 502); }
}
