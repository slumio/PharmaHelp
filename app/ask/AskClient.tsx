"use client";

import { useEffect, useRef, useState } from "react";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import MicIcon from "@mui/icons-material/Mic";
import SendIcon from "@mui/icons-material/Send";
import Box from "@mui/material/Box";

type Turn = { role: "user" | "bot"; text: string; tools?: { tool: string }[] };

const SUGGESTIONS = [
  "What expires in the next 90 days?",
  "What is low on stock?",
  "Where is Dolo 650 kept?",
  "How much stock is left of Pan 40?",
  "Today's revenue and udhaar",
];

export default function AskClient() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  type SR = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void; onend: () => void; start: () => void; stop: () => void };
  const recRef = useRef<SR | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const Ctor = (window as unknown as { webkitSpeechRecognition?: new () => SR; SpeechRecognition?: new () => SR }).webkitSpeechRecognition
      ?? (window as unknown as { SpeechRecognition?: new () => SR }).SpeechRecognition;
    if (Ctor) {
      setVoiceSupported(true);
      const rec = new Ctor();
      rec.lang = "en-IN";
      rec.interimResults = false;
      rec.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        setListening(false);
        void ask(transcript);
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
    }
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setTurns((t) => [...t, { role: "user", text: question }]);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const j = await r.json();
      setTurns((t) => [...t, { role: "bot", text: j.answer ?? j.error?.message ?? "Something went wrong", tools: j.toolCalls }]);
      const u = window.speechSynthesis;
      if (u) u.speak(new SpeechSynthesisUtterance(j.answer?.slice(0, 300) ?? ""));
    } finally {
      setBusy(false);
    }
  }

  const mic = () => {
    if (listening) { recRef.current?.stop(); return; }
    setListening(true);
    recRef.current?.start();
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 760, mx: "auto" }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Ask your store</Typography>
      <Stack direction="row" spacing={1}>
        {SUGGESTIONS.map((s) => <Chip key={s} label={s} onClick={() => void ask(s)} variant="outlined" />)}
      </Stack>
      <Paper variant="outlined" sx={{ p: 2, minHeight: 380, maxHeight: 480, overflow: "auto", bgcolor: "background.default" }}>
        {turns.length === 0 && <Typography color="text.secondary">Ask by voice or text — answers come from your store's database, never invented.</Typography>}
        {turns.map((t, i) => (
          <Box key={i} sx={{ my: 1, display: "flex", justifyContent: t.role === "user" ? "flex-end" : "flex-start" }}>
            <Paper sx={{ p: 1.5, maxWidth: "85%", bgcolor: t.role === "user" ? "primary.light" : "background.paper" }} elevation={1}>
              <Typography variant="body1">{t.text}</Typography>
              {t.tools?.length ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  via {t.tools.map((x) => x.tool).join(", ")}
                </Typography>
              ) : null}
            </Paper>
          </Box>
        ))}
        <div ref={endRef} />
      </Paper>
      <Stack direction="row" spacing={1}>
        <TextField
          fullWidth size="small" placeholder="Ask anything about your store…" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void ask(input)}
          disabled={busy}
        />
        {voiceSupported && (
          <IconButton color={listening ? "warning" : "primary"} onClick={mic} disabled={busy} aria-label="voice input">
            <MicIcon />
          </IconButton>
        )}
        <Button variant="contained" endIcon={<SendIcon />} onClick={() => void ask(input)} disabled={busy || !input.trim()}>
          Ask
        </Button>
      </Stack>
    </Stack>
  );
}
