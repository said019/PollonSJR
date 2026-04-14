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
 * Build a wa.me link with a pre-filled message.
 */
export function buildWALink(phone: string, message: string): string {
  const international = `52${phone}`;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

/**
 * MVP: Log the link — admin clicks it manually from the panel.
 * v2: Replace with sendWhatsAppTwilio.
 */
export async function sendWhatsAppMVP(job: NotificationJob): Promise<void> {
  const body = renderTemplate(job.template, job.params);
  const link = buildWALink(job.to, body);
  console.log(`📱 WA [${job.template}] → ${job.to}: ${link}`);
}

// Export the active send function — swap for Twilio in v2
export const sendWhatsApp = sendWhatsAppMVP;
