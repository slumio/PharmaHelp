"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Avatar, Box, Button, Chip, CircularProgress, IconButton, MenuItem, Paper, Stack, Switch, TextField, Tooltip, Typography } from "@mui/material";
import { AutoAwesomeRounded, MicRounded, SendRounded, StopRounded, VolumeUpRounded, Inventory2Outlined, ScheduleRounded, PlaceOutlined, TrendingUpRounded, DeleteOutlineRounded } from "@mui/icons-material";
type Action = { id: string; tool: string; args: Record<string, unknown>; demo: boolean; review: { label: string; value: string }[] };
type Turn = { actions?: Action[]; role: "user" | "bot"; text: string; tools?: { tool: string }[] };
type Recognition = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void; onerror: (e: { error: string }) => void; onend: () => void; start: () => void; stop: () => void; abort: () => void };
const suggestions = [
  { text: "What expires in the next 90 days?", title: "Stay ahead of expiry", caption: "See what needs attention soon", Icon: ScheduleRounded, color: "#d8b77d", bg: "#3e382e" },
  { text: "What is low on stock?", title: "Check your stock", caption: "Know what’s ready for a refill", Icon: Inventory2Outlined, color: "#8dbdc2", bg: "#2d4142" },
  { text: "Where is Dolo 650 kept?", title: "Find a medicine", caption: "The right shelf, in a moment", Icon: PlaceOutlined, color: "#b6a4ce", bg: "#393442" },
  { text: "Today's revenue and udhaar", title: "Get the day’s picture", caption: "Sales, orders and customer credit", Icon: TrendingUpRounded, color: "#95b9ee", bg: "#2f4057" },
];
export default function AskClient() {
  const [turns, setTurns] = useState<Turn[]>([]), [input, setInput] = useState("");
  const [busy, setBusy] = useState(false), [listening, setListening] = useState(false), [error, setError] = useState("");
  const [language, setLanguage] = useState("en-IN"), [speak, setSpeak] = useState(false);
  const [actionStates, setActionStates] = useState<Record<string, "saving" | "saved" | "cancelled">>({});
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const recognition = useRef<Recognition | null>(null), recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const end = useRef<HTMLDivElement>(null), inFlight = useRef(false), mounted = useRef(true);
  const stopTracks = () => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (timer.current) clearTimeout(timer.current); };
  useEffect(() => {
    mounted.current = true;
    const win = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setVoiceAvailable(Boolean(win.SpeechRecognition || win.webkitSpeechRecognition || (typeof navigator.mediaDevices?.getUserMedia === "function" && typeof window.MediaRecorder !== "undefined")));
    const question = new URLSearchParams(window.location.search).get("question");
    if (question) setInput(question.slice(0, 500));
    return () => { mounted.current = false; recognition.current?.abort(); if (recorder.current?.state === "recording") recorder.current.stop(); stopTracks(); window.speechSynthesis?.cancel(); };
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, busy]);
  async function ask(question: string) {
    if (!question.trim() || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setInput("");
    setTurns(t => [...t, { role: "user", text: question }]);
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, history: turns.slice(-8).map(turn => ({ role: turn.role === "bot" ? "assistant" : "user", content: turn.text.slice(0, 2000) })) }), signal: AbortSignal.timeout(55000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Your question could not be answered. Please try again.");
      if (!mounted.current) return;
      setTurns(t => [...t, { role: "bot", text: data.answer, tools: data.toolCalls, actions: data.actions }]);
      if (speak) read(data.answer);
    } catch (e) { if (mounted.current) { setError((e as Error).message); setInput(question); } }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function approve(action: Action) {
    if (actionStates[action.id]) return;
    setActionStates(states => ({ ...states, [action.id]: "saving" })); setError("");
    try {
      const response = await fetch("/api/agent/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: action.id, approved: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "The change could not be saved.");
      setActionStates(states => ({ ...states, [action.id]: "saved" }));
      setTurns(turns => [...turns, { role: "bot", text: result.result?.invoice ? `Sale saved. Invoice #${result.result.invoice.invoiceNo}, total ₹${result.result.invoice.total}.` : "Confirmed and saved to your store. Your stock and audit trail are updated." }]);
    } catch (e) { setError((e as Error).message); setActionStates(states => { const next = { ...states }; delete next[action.id]; return next; }); }
  }
  function read(text: string) {
    if (!window.speechSynthesis) { setError("Spoken answers are unavailable in this browser."); return; }
    window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text.slice(0, 1500)); utterance.lang = language; window.speechSynthesis.speak(utterance);
  }
  async function microphone() {
    if (listening) { recognition.current?.stop(); if (recorder.current?.state === "recording") recorder.current.stop(); setListening(false); return; }
    setError(""); window.speechSynthesis?.cancel();
    const win = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (Constructor) {
      const rec = new Constructor(); recognition.current = rec; rec.lang = language; rec.interimResults = false;
      rec.onresult = event => { setInput(event.results[0][0].transcript.slice(0, 500)); setListening(false); };
      rec.onend = () => { if (mounted.current) setListening(false); };
      rec.onerror = event => { setListening(false); if (event.error !== "aborted") setError(event.error === "not-allowed" ? "Microphone access was denied. Allow it in your browser settings, or type your question." : "We couldn’t hear you. Try again in a quieter place or type your question."); };
      try { setListening(true); rec.start(); timer.current = setTimeout(() => rec.stop(), 30000); } catch { setListening(false); setError("Microphone could not start. Please try again."); }
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Voice input requires HTTPS or localhost.");
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.current = audio;
      if (!mounted.current) { stopTracks(); return; }
      const media = new MediaRecorder(audio); recorder.current = media; const chunks: Blob[] = [];
      media.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      media.onstop = async () => {
        stopTracks(); if (!mounted.current) return; setListening(false); setBusy(true);
        try {
          const data = new FormData(), type = media.mimeType || "audio/webm";
          data.set("file", new Blob(chunks, { type }), type.includes("mp4") ? "voice.mp4" : "voice.webm"); data.set("language", language.slice(0, 2));
          const response = await fetch("/api/voice", { method: "POST", body: data, signal: AbortSignal.timeout(55000) }); const result = await response.json();
          if (!response.ok) throw new Error(result.error?.message ?? "Voice transcription failed");
          if (mounted.current) { setInput(result.text); if (!result.text) setError("No speech detected. Please try again."); }
        } catch (e) { if (mounted.current) setError((e as Error).message); }
        finally { if (mounted.current) setBusy(false); }
      };
      media.start(); setListening(true); timer.current = setTimeout(() => { if (media.state === "recording") media.stop(); }, 30000);
    } catch (e) { stopTracks(); setListening(false); setError((e as Error).message || "Please allow microphone access and try again."); }
  }
  return <Stack spacing={2.5} sx={{ maxWidth: 960, mx: "auto" }}>
    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center",  }}><Box><Typography variant="h4" sx={{ fontSize: { xs: 27, md: 31 } }}>A question away from clarity.</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .7 }}>Your inventory, sales and shelves. Just ask your store.</Typography></Box>{turns.length > 0 && <Tooltip title="Clear conversation"><IconButton aria-label="Clear conversation" onClick={() => { setTurns([]); window.speechSynthesis?.cancel(); }}><DeleteOutlineRounded /></IconButton></Tooltip>}</Stack>
    <Paper variant="outlined" sx={{ overflow: "hidden", bgcolor: "#202a2a" }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center",  px: { xs: 2, md: 3 }, py: 2, borderBottom: "1px solid", borderColor: "divider", bgcolor: "#1e2a2b" }}><Stack direction="row" spacing={1.4} sx={{ alignItems: "center",  }}><Avatar sx={{ bgcolor: "#304451", color: "#9ec2e9", borderRadius: 0, width: 38, height: 38 }}><AutoAwesomeRounded sx={{ fontSize: 20 }} /></Avatar><Box><Typography sx={{ fontWeight: 650, fontSize: 13 }}>Ask your store</Typography><Typography sx={{ fontSize: 10, color: "text.secondary" }}>Answers grounded in your store records</Typography></Box></Stack><Chip label="Voice + text" size="small" sx={{ bgcolor: "#303e50", color: "#b1c7e5", fontSize: 10 }} /></Stack>
      <Box aria-live="polite" role="log" aria-label="Conversation" sx={{ minHeight: { xs: 350, md: 420 }, maxHeight: 570, overflowY: "auto", px: { xs: 2, md: 4 }, py: 3 }}>
        {turns.length === 0 && <Box sx={{ textAlign: "center", pt: 3, pb: 2 }}><Box sx={{ width: 67, height: 67, display: "grid", placeItems: "center", bgcolor: "#293e49", borderRadius: "22px", mx: "auto", mb: 2.5, transform: "rotate(-7deg)" }}><AutoAwesomeRounded sx={{ color: "#86b9fa", fontSize: 31, transform: "rotate(7deg)" }} /></Box><Typography variant="h5" sx={{ fontSize: 23 }}>What would make your day easier?</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>Ask a question, or try “reduce 2 of Dolo 650mg” to prepare a change.</Typography><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.3, textAlign: "left", maxWidth: 590, mx: "auto" }}>{suggestions.map(({ text, title, caption, Icon, color, bg }) => <Button key={text} onClick={() => void ask(text)} disabled={busy} sx={{ color: "text.primary", p: 1.8, justifyContent: "flex-start", textAlign: "left", border: "1px solid #3b4b4b", "&:hover": { bgcolor: "#293b3d", borderColor: "#69acff" } }}><Box sx={{ display: "flex", p: 1, borderRadius: 0, bgcolor: bg, color, mr: 1.5 }}><Icon sx={{ fontSize: 20 }} /></Box><Box><Typography sx={{ fontSize: 12, fontWeight: 650 }}>{title}</Typography><Typography sx={{ fontSize: 10, color: "text.secondary", mt: .3 }}>{caption}</Typography></Box></Button>)}</Box></Box>}
        {turns.map((turn, i) => <Stack key={i} direction="row" spacing={1.2} sx={{ justifyContent: turn.role === "user" ? "flex-end" : "flex-start",  my: 2 }}>{turn.role === "bot" && <Avatar sx={{ width: 29, height: 29, bgcolor: "#2d4550", color: "#90c5ff" }}><AutoAwesomeRounded sx={{ fontSize: 15 }} /></Avatar>}<Box sx={{ maxWidth: "88%", bgcolor: turn.role === "user" ? "#304b5e" : "#263334", borderRadius: "12px", borderTopRightRadius: turn.role === "user" ? 3 : 12, p: 2 }}><Typography sx={{ fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{turn.text}</Typography>{turn.tools?.length ? <Typography sx={{ color: "text.secondary", fontSize: 9, mt: 1 }}>via {turn.tools.map(t => t.tool).join(", ")}</Typography> : null}{turn.actions?.map(action => <Box key={action.id} sx={{ mt: 2, p: 2, border: "1px solid #4b718f", bgcolor: "#233946" }}>
          <Typography sx={{ fontFamily: '"Chivo Mono", monospace', fontSize: 10, color: "#8ec0fa", mb: 1 }}>REVIEW BEFORE SAVING / {({ upsert_stock: "ADD STOCK", reduce_stock: "REDUCE STOCK", update_stock_count: "CORRECT COUNT", delete_stock: "REMOVE STOCK", create_order: "CREATE SALE" } as Record<string, string>)[action.tool]}</Typography>
          <Stack spacing={.7}>{action.review.map((detail, index) => <Stack key={index} direction="row" spacing={2} sx={{ justifyContent: "space-between", gap: 2 }}><Typography sx={{ fontSize: 11, color: "text.secondary" }}>{detail.label}</Typography><Typography sx={{ fontSize: 11, textAlign: "right", overflowWrap: "anywhere" }}>{detail.value}</Typography></Stack>)}</Stack>
          <Typography sx={{ fontSize: 10, color: "text.secondary", my: 1.5 }}>{action.demo ? "Sample-data preview. Connect MongoDB to enable real changes." : "Nothing has changed yet. This proposal expires in 15 minutes."}</Typography>
          <Stack direction="row" spacing={1}><Button variant="contained" size="small" disabled={action.demo || Boolean(actionStates[action.id])} onClick={() => void approve(action)}>{actionStates[action.id] === "saved" ? "Saved" : actionStates[action.id] === "saving" ? "Saving…" : actionStates[action.id] === "cancelled" ? "Cancelled" : "Confirm change"}</Button><Button size="small" disabled={Boolean(actionStates[action.id])} onClick={() => setActionStates(states => ({ ...states, [action.id]: "cancelled" }))}>Cancel</Button></Stack>
        </Box>)}{turn.role === "bot" && <IconButton aria-label="Read answer aloud" onClick={() => read(turn.text)} size="small" sx={{ mt: .7 }}><VolumeUpRounded sx={{ fontSize: 16 }} /></IconButton>}</Box></Stack>)}
        {busy && <Stack direction="row" spacing={1.5} sx={{ alignItems: "center",  p: 2 }}><CircularProgress size={16} /><Typography sx={{ fontSize: 12, color: "text.secondary" }}>Checking your store records…</Typography></Stack>}<div ref={end} />
      </Box>
      <Box sx={{ px: { xs: 2, md: 3 }, pb: 2.5 }}>
        {error && <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setError("")}>{error}</Alert>}
        {listening && <Alert severity="info" icon={<MicRounded />} sx={{ mb: 1.5 }}>Listening… tap stop when you’re done. Review your words before sending.</Alert>}
        <Stack component="form" onSubmit={e => { e.preventDefault(); void ask(input); }} direction="row" spacing={1} sx={{ alignItems: "center",  border: "1px solid #415454", borderRadius: 0, p: .8, bgcolor: "#202a2a", boxShadow: "0 3px 12px #152b1705" }}>
          <TextField fullWidth multiline maxRows={3} placeholder="Ask anything about your store…" value={input} onChange={e => setInput(e.target.value.slice(0, 500))} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(input); } }} disabled={busy || listening} slotProps={{ input: { sx: { fontSize: 13, "& fieldset": { border: 0 } } }, htmlInput: { "aria-label": "Your store question", maxLength: 500 } }} size="small" />
          {voiceAvailable && <Tooltip title={listening ? "Stop listening" : "Speak your question"}><span><IconButton aria-label={listening ? "Stop listening" : "Speak your question"} disabled={busy} onClick={() => void microphone()} sx={{ color: listening ? "#f48f7a" : "#a1c3d8", bgcolor: listening ? "#4b3030" : "#2b3a3d" }}>{listening ? <StopRounded /> : <MicRounded />}</IconButton></span></Tooltip>}
          <Button type="submit" variant="contained" aria-label="Ask" disabled={busy || listening || !input.trim()} sx={{ minWidth: 44, px: 1.5 }}><SendRounded sx={{ fontSize: 19 }} /></Button>
        </Stack>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between",  mt: 1.5, gap: 1, flexWrap: "wrap" }}><Stack direction="row" spacing={1.5} sx={{ alignItems: "center",  }}><TextField select size="small" value={language} onChange={e => setLanguage(e.target.value)} disabled={listening || busy} slotProps={{ htmlInput: { "aria-label": "Voice language" } }} sx={{ "& .MuiSelect-select": { py: .5, fontSize: 11 }, "& fieldset": { border: 0 } }}><MenuItem value="en-IN">English (India)</MenuItem><MenuItem value="hi-IN">हिन्दी</MenuItem></TextField><Stack component="label" direction="row" sx={{ alignItems: "center",  fontSize: 10, color: "text.secondary" }}><Switch size="small" checked={speak} onChange={e => { setSpeak(e.target.checked); if (!e.target.checked) window.speechSynthesis?.cancel(); }} slotProps={{ input: { "aria-label": "Speak answers" } }} />Speak answers</Stack></Stack><Typography sx={{ fontSize: 9, color: "text.secondary" }}>Review voice text before sending · Enter to ask</Typography></Stack>
      </Box>
    </Paper>
    <Typography sx={{ fontSize: 10, color: "text.secondary", textAlign: "center" }}>A helping hand for store operations. Prepare stock changes in chat. Review and confirm before they are saved.</Typography>
  </Stack>;
}
