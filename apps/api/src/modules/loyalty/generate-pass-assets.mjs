/**
 * generate-pass-assets.mjs
 * Generates Apple Wallet pass images for Pollón loyalty card.
 * Uses the actual Pollón chicken logo drawn via canvas paths.
 *
 * Run: node generate-pass-assets.mjs
 */
import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "pass-assets");
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// ── Brand colours ────────────────────────────────────────────
const DARK_BG    = "#2D3039";   // from logo background
const DARKER_BG  = "#1E2028";
const RED        = "#E8384F";   // logo chicken red
const RED_DIM    = "#C22C3E";
const WHITE      = "#FFFFFF";
const CREAM      = "#F5F0EB";
const GREY_TEXT  = "rgba(255,255,255,0.4)";
const EMPTY_RING = "rgba(232,56,79,0.25)";
const EMPTY_FILL = "rgba(232,56,79,0.06)";
const GHOST      = "rgba(232,56,79,0.12)";
const MAX        = 5;

function save(canvas, filename) {
  fs.writeFileSync(path.join(OUT, filename), canvas.toBuffer("image/png"));
  console.log(`  ${filename}`);
}
function scale(canvas, factor) {
  const c = createCanvas(Math.round(canvas.width / factor), Math.round(canvas.height / factor));
  c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

// ── Pollón chicken silhouette ─────────────────────────────────
// Stylised chicken head facing right, drawn as a single path.
// Designed at 100×100 unit box, call with translate+scale.
function drawChicken(ctx, cx, cy, size, color) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size / 100;
  ctx.scale(s, s);
  ctx.fillStyle = color;

  // Body — rounded chicken head and breast
  ctx.beginPath();
  // Start at top of comb
  ctx.moveTo(-5, -48);
  // Comb (three bumps on top)
  ctx.bezierCurveTo(-15, -52, -18, -40, -10, -38);
  ctx.bezierCurveTo(-20, -42, -25, -32, -16, -28);
  // Back of head
  ctx.bezierCurveTo(-28, -28, -36, -16, -36, -2);
  // Throat and wattle
  ctx.bezierCurveTo(-36, 8, -30, 18, -22, 24);
  ctx.bezierCurveTo(-26, 30, -24, 38, -18, 38);
  ctx.bezierCurveTo(-14, 38, -12, 34, -14, 28);
  // Breast curve
  ctx.bezierCurveTo(-8, 36, 6, 42, 18, 44);
  // Tail feathers
  ctx.bezierCurveTo(28, 44, 38, 36, 38, 20);
  ctx.bezierCurveTo(38, 10, 32, -2, 24, -12);
  // Wing detail
  ctx.bezierCurveTo(18, -20, 10, -28, 6, -36);
  // Top of head back to comb
  ctx.bezierCurveTo(2, -42, -2, -46, -5, -48);
  ctx.closePath();
  ctx.fill();

  // Eye
  ctx.beginPath();
  ctx.arc(-14, -10, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = color === WHITE || color === CREAM ? DARK_BG : WHITE;
  ctx.fill();

  // Beak
  ctx.beginPath();
  ctx.moveTo(-36, -4);
  ctx.lineTo(-48, 2);
  ctx.lineTo(-36, 8);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

// ── Draw a single stamp ──────────────────────────────────────
function drawStamp(ctx, cx, cy, r, filled) {
  if (filled) {
    // Solid circle with subtle gradient
    const grd = ctx.createRadialGradient(cx, cy - r * 0.12, r * 0.2, cx, cy, r);
    grd.addColorStop(0, RED);
    grd.addColorStop(1, RED_DIM);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Thin inner highlight ring
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Chicken silhouette in white
    drawChicken(ctx, cx + 2, cy + 2, r * 1.05, CREAM);
  } else {
    // Empty — ghost ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = EMPTY_FILL;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = EMPTY_RING;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // Ghost chicken
    drawChicken(ctx, cx + 2, cy + 2, r * 0.9, GHOST);
  }
}

// ── Strip @2x: 750 × 246 ─────────────────────────────────────
function makeStrip2x(filled) {
  const W = 750, H = 246;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background: dark gradient matching the logo bg
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, DARKER_BG);
  bg.addColorStop(0.5, DARK_BG);
  bg.addColorStop(1, DARKER_BG);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle left accent bar
  const accent = ctx.createLinearGradient(0, 0, 0, H);
  accent.addColorStop(0, "transparent");
  accent.addColorStop(0.3, RED);
  accent.addColorStop(0.7, RED);
  accent.addColorStop(1, "transparent");
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 2.5, H);

  // "CLUB POLLÓN" top-left label
  ctx.save();
  ctx.fillStyle = GREY_TEXT;
  ctx.font = 'bold 14px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.letterSpacing = "6px";
  ctx.fillText("CLUB POLLÓN", 30, 30);
  ctx.restore();

  // 5 stamps
  const R = 48;
  const gap = 22;
  const totalW = MAX * (R * 2) + (MAX - 1) * gap;
  const startX = (W - totalW) / 2 + R;
  const cy = H / 2 + 8;

  for (let i = 0; i < MAX; i++) {
    drawStamp(ctx, startX + i * (R * 2 + gap), cy, R, i < filled);
  }

  // Bottom-right counter
  ctx.save();
  if (filled >= MAX) {
    ctx.fillStyle = "#FDE68A"; // gold
    ctx.font = 'bold 26px "Helvetica Neue", Helvetica, Arial, sans-serif';
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = 'bold 22px "Helvetica Neue", Helvetica, Arial, sans-serif';
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(filled >= MAX ? "PREMIO LISTO" : `${filled} / ${MAX}`, W - 30, H - 16);
  ctx.restore();

  return canvas;
}

// ── Logo @2x: 320 × 100 ──────────────────────────────────────
function makeLogo2x() {
  const W = 320, H = 100;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  // Chicken icon on left
  drawChicken(ctx, 38, 50, 68, RED);

  // "POLLÓN" wordmark in clean bold
  ctx.fillStyle = WHITE;
  ctx.font = 'bold 34px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("POLLÓN", 78, 44);

  // Subtitle
  ctx.fillStyle = RED;
  ctx.font = '600 12px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.fillText("ESTILO AMERICANO", 80, 68);

  return canvas;
}

// ── Icon @2x: 58 × 58 ────────────────────────────────────────
function makeIcon2x() {
  const S = 58;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext("2d");

  // Rounded-square background
  const r = 12;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(S-r, 0); ctx.quadraticCurveTo(S, 0, S, r);
  ctx.lineTo(S, S-r); ctx.quadraticCurveTo(S, S, S-r, S);
  ctx.lineTo(r, S); ctx.quadraticCurveTo(0, S, 0, S-r);
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = DARK_BG;
  ctx.fill();

  // Chicken
  drawChicken(ctx, S / 2 + 1, S / 2 + 1, S * 0.72, RED);

  return canvas;
}

// ── Generate ──────────────────────────────────────────────────
console.log("\n🎨 Generating Pollón Apple Wallet assets...\n");

for (let i = 0; i <= MAX; i++) {
  const c2x = makeStrip2x(i);
  save(c2x, `strip-${i}@2x.png`);
  save(scale(c2x, 2), `strip-${i}.png`);
}

const logo2x = makeLogo2x();
save(logo2x, "logo@2x.png");
save(scale(logo2x, 2), "logo.png");

const icon2x = makeIcon2x();
save(icon2x, "icon@2x.png");
save(scale(icon2x, 2), "icon.png");

console.log("\n✅ Done!\n");
