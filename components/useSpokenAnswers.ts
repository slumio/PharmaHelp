"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Options = { language: string; onError: (message: string) => void };
/** Retain utterances, wait for device voices, and surface blocked/failed playback. */
export function useSpokenAnswers({ language, onError }: Options) {
  const [speaking, setSpeaking] = useState(false), [loading, setLoading] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]), [aiAvailable, setAiAvailable] = useState(false);
  const [voice, setVoice] = useState("auto");
  const current = useRef<SpeechSynthesisUtterance | null>(null), audio = useRef<HTMLAudioElement | null>(null), url = useRef<string | null>(null);
  const operation = useRef(0), abort = useRef<AbortController | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorRef = useRef(onError); errorRef.current = onError;
  const stop = useCallback(() => {
    operation.current++; abort.current?.abort(); abort.current = null;
    if (timer.current) clearTimeout(timer.current);
    if (current.current) { current.current.onend = null; current.current.onerror = null; current.current.onstart = null; }
    current.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (audio.current) { audio.current.pause(); audio.current.removeAttribute("src"); audio.current.load(); audio.current = null; }
    if (url.current) { URL.revokeObjectURL(url.current); url.current = null; }
    setSpeaking(false); setLoading(false);
  }, []);
  useEffect(() => {
    const synth = window.speechSynthesis;
    const update = () => setVoices(synth?.getVoices() ?? []);
    update(); synth?.addEventListener("voiceschanged", update);
    const controller = new AbortController();
    void fetch("/api/voice", { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(data => { if (data) setAiAvailable(Boolean(data.speechEnabled)); }).catch(() => {});
    return () => { controller.abort(); synth?.removeEventListener("voiceschanged", update); stop(); };
  }, [stop]);
  const read = useCallback(async (raw: string) => {
    stop(); const id = operation.current;
    const text = raw.replace(/[*#`]/g, "").trim().slice(0, 2000);
    if (!text) return;
    setLoading(true);
    const synth = window.speechSynthesis;
    let available = synth?.getVoices() ?? [];
    if (voice !== "ai" && synth && !available.length) {
      // Chromium/Safari often populate voices asynchronously after the first render.
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timeout); synth.removeEventListener("voiceschanged", done); resolve(); };
        const timeout = setTimeout(done, 1000); synth.addEventListener("voiceschanged", done);
      });
      available = synth.getVoices();
    }
    if (id !== operation.current) return;
    const selected = voice !== "auto" && voice !== "ai" ? available.find(v => v.voiceURI === voice) : available.find(v => v.lang.toLowerCase() === language.toLowerCase()) ?? available.find(v => v.lang.slice(0, 2) === language.slice(0, 2)) ?? available.find(v => v.default) ?? available[0];
    const playAi = async () => {
      if (!aiAvailable) { setLoading(false); errorRef.current("No device voice is available. Install a speech voice in your device settings, or enable AI voice with OPENAI_API_KEY. You can still read the answer on screen."); return; }
      try {
        const controller = new AbortController(); abort.current = controller;
        const response = await fetch("/api/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: controller.signal });
        if (!response.ok) { const result = await response.json(); throw new Error(result.error?.message ?? "Audio could not be generated."); }
        const blob = await response.blob(); if (id !== operation.current) return;
        if (!blob.size) throw new Error("The voice service returned empty audio. Please try again.");
        const source = URL.createObjectURL(blob); url.current = source;
        const player = new Audio(source); audio.current = player;
        player.onended = () => { if (id === operation.current) stop(); };
        player.onerror = () => { if (id === operation.current) { stop(); errorRef.current("Audio playback failed. Try another voice or check your device audio settings."); } };
        await player.play(); if (id === operation.current) { setLoading(false); setSpeaking(true); }
      } catch (error) {
        if (id !== operation.current) return;
        stop(); errorRef.current((error as Error).name === "NotAllowedError" ? "Your browser blocked automatic audio. Tap “Read answer aloud” on the answer to start playback." : (error as Error).message);
      }
    };
    if (voice === "ai" || !synth || !selected) { await playAi(); return; }
    // Short chunks avoid long-utterance hangs in some browser speech engines.
    const chunks = text.match(/.{1,180}(?:\s|$)|\S{1,180}/gu) ?? [text];
    let index = 0;
    const next = () => {
      if (id !== operation.current) return;
      if (index >= chunks.length) { current.current = null; setSpeaking(false); setLoading(false); return; }
      const utterance = new SpeechSynthesisUtterance(chunks[index++]); current.current = utterance;
      utterance.voice = selected; utterance.lang = selected.lang || language; utterance.rate = 1; utterance.volume = 1;
      utterance.onstart = () => { if (id === operation.current) { if (timer.current) clearTimeout(timer.current); setLoading(false); setSpeaking(true); } };
      utterance.onend = next;
      utterance.onerror = event => {
        if (id !== operation.current || ["canceled", "interrupted"].includes(event.error)) return;
        if (timer.current) clearTimeout(timer.current);
        current.current = null; setSpeaking(false);
        if (event.error === "not-allowed") { setLoading(false); errorRef.current("Your browser blocked automatic audio. Tap “Read answer aloud” to play it."); }
        else void playAi();
      };
      timer.current = setTimeout(() => {
        if (id !== operation.current) return;
        utterance.onerror = null; utterance.onend = null; synth.cancel(); current.current = null;
        void playAi();
      }, 7000);
      try { synth.resume(); synth.speak(utterance); }
      catch { if (timer.current) clearTimeout(timer.current); void playAi(); }
    };
    next();
  }, [aiAvailable, language, stop, voice]);
  return { read, stop, speaking, loading, voices, voice, setVoice, aiAvailable };
}
