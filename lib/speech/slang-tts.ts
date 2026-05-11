type PendingSpeech = {
  phrase: string;
  isCorrect: boolean;
  personaSlug?: string;
} | null;

let pendingSpeech: PendingSpeech = null;
let unlockListenersAttached = false;
let primed = false;
let activeAudio: HTMLAudioElement | null = null;

export function speakSlangVerdict(opts: {
  verdict: string;
  isCorrect: boolean;
  personaSlug?: string;
}): void {
  if (typeof window === "undefined") return;

  const phrase = toShortSpokenSlang(opts.verdict, opts.isCorrect);
  if (!phrase) return;

  // Some browsers gate speech behind a user activation.
  if (!hasUserActivation()) {
    pendingSpeech = { phrase, isCorrect: opts.isCorrect, personaSlug: opts.personaSlug };
    attachUnlockListeners();
    return;
  }

  void speakViaApiThenFallback({
    phrase,
    isCorrect: opts.isCorrect,
    personaSlug: opts.personaSlug,
  });
}

/**
 * Call from a direct user gesture (e.g. answer-button click) so speech can
 * run later from async API callbacks without autoplay blocking.
 */
export function primeSlangSpeech(): void {
  if (typeof window === "undefined") return;
  if (primed) return;
  primed = true;
  // Unlock HTMLMediaElement autoplay path on first user gesture.
  try {
    const a = new Audio();
    a.muted = true;
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => undefined);
    a.pause();
  } catch {
    // no-op
  }
  // Also prime speech-synthesis where available for fallback path.
  if ("speechSynthesis" in window) {
    const synth = window.speechSynthesis;
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      u.rate = 1;
      u.pitch = 1;
      synth.cancel();
      synth.speak(u);
    } catch {
      // no-op
    }
  }
}

function hasUserActivation(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = (navigator as Navigator & {
    userActivation?: { hasBeenActive?: boolean };
  }).userActivation;
  return ua?.hasBeenActive ?? true;
}

function attachUnlockListeners(): void {
  if (typeof window === "undefined" || unlockListenersAttached) return;
  unlockListenersAttached = true;
  const unlock = () => {
    if (pendingSpeech) {
      void speakViaApiThenFallback({
        phrase: pendingSpeech.phrase,
        isCorrect: pendingSpeech.isCorrect,
        personaSlug: pendingSpeech.personaSlug,
      });
      pendingSpeech = null;
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    unlockListenersAttached = false;
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

function pickVoice(
  synth: SpeechSynthesis,
): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  if (!voices || voices.length === 0) return null;
  const english = voices.find((v) => /^en[-_]/i.test(v.lang));
  return english ?? voices[0] ?? null;
}

async function speakViaApiThenFallback(opts: {
  phrase: string;
  isCorrect: boolean;
  personaSlug?: string;
}): Promise<void> {
  const ok = await speakViaApi(opts.phrase, opts.personaSlug);
  if (!ok) speakPhrase(opts.phrase, opts.isCorrect);
}

async function speakViaApi(
  phrase: string,
  personaSlug?: string,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch("/api/slang/voice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: phrase, personaSlug }),
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    if (blob.size === 0) return false;
    const url = URL.createObjectURL(blob);
    if (activeAudio) {
      activeAudio.pause();
      activeAudio = null;
    }
    const audio = new Audio(url);
    activeAudio = audio;
    await audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
    audio.onerror = () => URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

function speakPhrase(phrase: string, isCorrect: boolean): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  try {
    synth.resume();
  } catch {
    // ignore
  }
  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.lang = "en-US";
  utterance.rate = 1.05;
  utterance.pitch = isCorrect ? 1.15 : 0.95;
  utterance.volume = 1;
  const voice = pickVoice(synth);
  if (voice) utterance.voice = voice;

  // Keep callouts snappy; replace any queued stale callouts.
  synth.cancel();
  if (synth.getVoices().length === 0) {
    // On some browsers voices are async-loaded; retry once when available.
    const onVoices = () => {
      const loadedVoice = pickVoice(synth);
      if (loadedVoice) utterance.voice = loadedVoice;
      synth.speak(utterance);
      synth.removeEventListener("voiceschanged", onVoices);
    };
    synth.addEventListener("voiceschanged", onVoices);
    // Fallback timeout in case voiceschanged never fires.
    window.setTimeout(() => {
      synth.speak(utterance);
      synth.removeEventListener("voiceschanged", onVoices);
    }, 200);
    return;
  }
  synth.speak(utterance);
}

function toShortSpokenSlang(verdict: string, isCorrect: boolean): string {
  const lower = verdict.toLowerCase();

  if (isCorrect) {
    if (/\blet him cook\b/.test(lower)) return "W move, let him cook";
    if (/\bgigachad\b/.test(lower)) return "actual gigachad move";
    if (/\brent free\b/.test(lower)) return "rent free, clean read";
    return "W move, clean read";
  }

  const streakMatch = lower.match(/(\d+)\s+l[s]?\s+in\s+a\s+row/);
  if (streakMatch) {
    const n = Number(streakMatch[1]);
    if (Number.isFinite(n) && n > 0) {
      return `bruh, ${ordinal(n)} miss`;
    }
  }

  if (/\bskill issue\b/.test(lower)) return "skill issue, bruh";
  if (/\bcaught in 4k\b/.test(lower)) return "caught in four K";
  if (/\bcooked\b/.test(lower)) return "you got cooked, bruh";
  return "bruh, wrong pick";
}

function ordinal(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}
