import { createHash } from "node:crypto";
import type { Incoming } from "./bot";

// Only the operator-configured, complete WhatsApp Business greeting is exempt
// from staff takeover. No keyword matching, customer text, or AI classification.
export function isBusinessGreeting(input: Incoming): boolean {
  if (!input.fromMe || input.hasImage || input.unsupportedMedia || input.location || input.buttonId || input.catalogSelection || !input.text.trim()) return false;
  const approved = (process.env.WHATSAPP_BUSINESS_GREETING_SHA256 || "").split(",").map(s => s.trim().toLowerCase()).filter(s => /^[a-f0-9]{64}$/.test(s));
  if (!approved.length) return false;
  const canonical = input.text.normalize("NFC").trim().replace(/\s+/gu, " ");
  return approved.includes(createHash("sha256").update(canonical).digest("hex"));
}
