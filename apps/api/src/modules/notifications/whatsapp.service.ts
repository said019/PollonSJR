import { renderTemplate } from "./templates";

export interface NotificationJob {
  id: string;
  type: "whatsapp";
  to: string; // 10-digit MX phone
  template: string;
  params: Record<string, string>;
  attempts: number;
  createdAt: string;
}

/**
 * Build a wa.me link with a pre-filled message (fallback / MVP).
 */
export function buildWALink(phone: string, message: string): string {
  const international = `52${phone}`;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

/**
 * MVP fallback: log the link for manual sending by admin.
 */
export async function sendWhatsAppMVP(job: NotificationJob): Promise<void> {
  const body = renderTemplate(job.template, job.params);
  const link = buildWALink(job.to, body);
  console.log(`📱 WA [${job.template}] → ${job.to}: ${link}`);
}

/**
 * Evolution API sender.
 * Env vars required:
 *   EVOLUTION_API_URL     → base URL (e.g. https://evolution.yourdomain.com)
 *   EVOLUTION_API_KEY     → apikey header value
 *   EVOLUTION_INSTANCE    → instance name (e.g. "pollon-sjr")
 *   EVOLUTION_COUNTRY_CODE → defaults to "52" (MX)
 */
export async function sendWhatsAppEvolution(job: NotificationJob): Promise<void> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  const countryCode = process.env.EVOLUTION_COUNTRY_CODE || "52";

  if (!apiUrl || !apiKey || !instance) {
    // Missing config → fall back to MVP log
    return sendWhatsAppMVP(job);
  }

  const body = renderTemplate(job.template, job.params);
  const number = `${countryCode}${job.to}`;

  const res = await fetch(`${apiUrl.replace(/\/$/, "")}/message/sendText/${instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({
      number,
      text: body,
      // Optional Evolution API params:
      delay: 800,
      linkPreview: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Evolution API ${res.status}: ${errText.slice(0, 200)}`);
  }

  console.log(`📤 WA [${job.template}] → +${number} (Evolution OK)`);
}

/**
 * Smart default: if Evolution API is configured, use it; otherwise fall back to MVP (log only).
 */
export async function sendWhatsApp(job: NotificationJob): Promise<void> {
  if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE) {
    return sendWhatsAppEvolution(job);
  }
  return sendWhatsAppMVP(job);
}
