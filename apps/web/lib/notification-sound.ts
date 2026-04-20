/**
 * New-order notification sound for the admin panel.
 * Pre-loads /new-order.mp3 so it plays instantly when needed.
 */

let audio: HTMLAudioElement | null = null;
let preloaded = false;

/**
 * Pre-load the audio file into memory.
 * Call once when the admin panel mounts.
 */
export function preloadNewOrderSound() {
  if (preloaded || typeof window === "undefined") return;
  audio = new Audio("/new-order.mp3");
  audio.volume = 0.7;
  // Force browser to download and buffer the entire file
  audio.preload = "auto";
  audio.load();
  preloaded = true;
}

/**
 * Play the new-order notification sound instantly.
 */
export function playNewOrderSound() {
  try {
    if (!audio) {
      // Fallback if preload wasn't called
      audio = new Audio("/new-order.mp3");
      audio.volume = 0.7;
    }

    // If already playing, rewind and play again
    audio.currentTime = 0;
    void audio.play();
  } catch {
    // Audio not available — silently skip
  }
}
