/**
 * Warm, pleasant notification chime for new orders.
 * Uses Web Audio API — no external audio files needed.
 *
 * Pattern: two gentle tones (C5 → E5) with a soft bell-like timbre,
 * ~1.5 seconds total. Attention-grabbing but not startling.
 */

let audioCtx: AudioContext | null = null;

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume: number
) {
  // Main oscillator — sine for warmth
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, startTime);

  // Harmonic overtone for bell-like character
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(freq * 2.5, startTime); // bell partial

  // Gain envelope — quick attack, gentle decay
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.02); // fast attack
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration); // smooth decay

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0, startTime);
  gain2.gain.linearRampToValueAtTime(volume * 0.15, startTime + 0.01);
  gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.6);

  osc.connect(gain);
  osc2.connect(gain2);
  gain.connect(ctx.destination);
  gain2.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
  osc2.start(startTime);
  osc2.stop(startTime + duration);
}

/**
 * Play the new-order notification chime.
 * Call this when `order:new` fires in the admin panel.
 */
export function playNewOrderSound() {
  try {
    const ctx = getContext();

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const vol = 0.25; // gentle volume

    // Three-note ascending chime: C5 → E5 → G5
    playTone(ctx, 523.25, now,        0.6, vol);       // C5
    playTone(ctx, 659.25, now + 0.22, 0.6, vol * 0.9); // E5
    playTone(ctx, 783.99, now + 0.44, 0.9, vol * 0.8); // G5 — longer ring
  } catch {
    // Web Audio not available — silently skip
  }
}
