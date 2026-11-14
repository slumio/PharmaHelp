import { NextRequest } from "next/server";
export const runtime = "nodejs";
export const maxDuration = 60;
const failure = (message: string, status: number) => Response.json({ error: { code: "voice", message } }, { status });
export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) return failure("Voice recording requires OPENAI_API_KEY on this browser. Try Chrome's speech recognition or type your question.", 503);
  if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024) return failure("Recording is too large. Keep it under 30 seconds.", 413);
  try {
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024) return failure("Choose an audio recording under 3 MB.", 400);
    if (!/^(audio\/(webm|ogg|mp4|mpeg|wav|x-wav)|video\/(webm|mp4))/.test(file.type)) return failure("Unsupported recording format.", 400);
    const form = new FormData();
    form.set("file", file);
    form.set("model", process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-transcribe");
    form.set("language", data.get("language") === "hi" ? "hi" : "en");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(45000) });
    if (!response.ok) return failure("The voice service is unavailable. Please type your question or try again.", 502);
    const result = await response.json();
    return Response.json({ text: String(result.text ?? "").trim().slice(0, 500) });
  } catch { return failure("Could not transcribe this recording. Please try again.", 502); }
}
