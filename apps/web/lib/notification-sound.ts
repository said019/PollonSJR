/**
 * New-order notification sound for the admin panel.
 * Plays /new-order.mp3 when a new order arrives.
 */

let audio: HTMLAudioElement | null = null;

/**
 * Play the new-order notification sound.
 * Call this when `order:new` fires in the admin panel.
 */
export function playNewOrderSound() {
  try {
    // Stop previous play if still going
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    audio = new Audio("/new-order.mp3");
    audio.volume = 0.7;
    void audio.play();
  } catch {
    // Audio not available — silently skip
  }
}
