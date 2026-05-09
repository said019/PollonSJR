/**
 * New-order notification sound for the admin panel.
 * Supports 3 sound options synthesized via Web Audio API + classic mp3 ringtone.
 * Selection persists in localStorage as `pollon:admin_sound`.
 */

export type AdminSound = "ringtone" | "campana" | "chime" | "fanfare";

const STORAGE_KEY = "pollon:admin_sound";
const VOLUME_KEY = "pollon:admin_sound_volume";

const DEFAULT_SOUND: AdminSound = "ringtone";
const DEFAULT_VOLUME = 0.7;

let audio: HTMLAudioElement | null = null;
let preloaded = false;

export function getCurrentSound(): AdminSound {
  if (typeof window === "undefined") return DEFAULT_SOUND;
  const v = localStorage.getItem(STORAGE_KEY) as AdminSound | null;
  if (v && ["ringtone", "campana", "chime", "fanfare"].includes(v)) return v;
  return DEFAULT_SOUND;
}

export function setCurrentSound(sound: AdminSound) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, sound);
}

export function getVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  const raw = localStorage.getItem(VOLUME_KEY);
  const parsed = raw ? parseFloat(raw) : DEFAULT_VOLUME;
  if (isNaN(parsed)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, parsed));
}

export function setVolume(value: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(VOLUME_KEY, String(Math.min(1, Math.max(0, value))));
  if (audio) audio.volume = getVolume();
}

export function preloadNewOrderSound() {
  if (preloaded || typeof window === "undefined") return;
  audio = new Audio("/new-order.mp3");
  audio.volume = getVolume();
  audio.preload = "auto";
  audio.load();
  preloaded = true;
}

export function playNewOrderSound() {
  if (typeof window === "undefined") return;
  const sound = getCurrentSound();
  if (sound === "ringtone") {
    playRingtone();
  } else {
    playSynth(sound);
  }
}

function playRingtone() {
  try {
    if (!audio) {
      audio = new Audio("/new-order.mp3");
      audio.volume = getVolume();
    }
    audio.currentTime = 0;
    void audio.play();
  } catch {
    /* silent */
  }
}

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function tone(
  frequency: number,
  startOffset: number,
  duration: number,
  type: OscillatorType = "sine"
) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + startOffset;
  const osc = c.createOscillator();
  const gain = c.createGain();
  const vol = getVolume();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol * 0.8, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export function playSynth(sound: Exclude<AdminSound, "ringtone">) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume();
  }
  if (sound === "campana") {
    // Doble ding-ding (campana clásica)
    tone(880, 0, 0.18, "sine");
    tone(660, 0.06, 0.22, "sine");
    tone(880, 0.34, 0.18, "sine");
    tone(660, 0.4, 0.22, "sine");
  } else if (sound === "chime") {
    // 4 notas ascendentes (do-mi-sol-do)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone(f, i * 0.12, 0.22, "triangle"));
  } else if (sound === "fanfare") {
    // 3 notas alegres (sol-do-mi)
    tone(783.99, 0, 0.16, "square");
    tone(1046.5, 0.18, 0.16, "square");
    tone(1318.51, 0.36, 0.32, "square");
  }
}
