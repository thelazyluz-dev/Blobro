// Speaks a creature's name aloud via the browser's built-in Web Speech API.
// No files and no network requests from us — the platform provides the voice.
// A no-op when muted or unsupported.

let voice: SpeechSynthesisVoice | null = null;
let triedVoice = false;

function pickVoice(): SpeechSynthesisVoice | null {
  if (triedVoice) return voice;
  triedVoice = true;
  const synth = window.speechSynthesis;
  if (!synth) return null;
  const voices = synth.getVoices();
  // Prefer a Hebrew voice; fall back to anything.
  voice = voices.find((v) => v.lang?.toLowerCase().startsWith('he')) ?? voices[0] ?? null;
  return voice;
}

// Voices may load asynchronously; refresh once they're available.
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    triedVoice = false;
    pickVoice();
  };
}

const NIKUD = /[֑-ׇ]/g;

/** Speak a short Hebrew phrase aloud. Nikud is stripped for clean reading. */
export function speak(text: string, muted: boolean, pitch = 1.15, rate = 0.95): void {
  if (muted) return;
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel(); // don't stack utterances
    const u = new SpeechSynthesisUtterance(text.replace(NIKUD, '').trim());
    u.lang = 'he-IL';
    u.rate = rate;
    u.pitch = pitch;
    const v = pickVoice();
    if (v) u.voice = v;
    synth.speak(u);
  } catch {
    /* speech is a nicety — ignore failures */
  }
}

/** Speak a creature's name. */
export function speakName(nameHe: string, muted: boolean): void {
  speak(nameHe, muted);
}

const COMPLIMENTS = ['תּוֹתָח!', 'וָואוּ!', 'אַלּוּף!', 'מְטֹרָף!', 'פְּצָצָה!', 'אֵלּוּף אֲמִיתִּי!'];

/** Speak a random excited compliment — used on big milestone celebrations. */
export function speakCompliment(muted: boolean): void {
  const phrase = COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)];
  speak(phrase, muted, 1.3, 1.0);
}
