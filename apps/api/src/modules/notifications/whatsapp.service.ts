import crypto from "node:crypto";
import { attentionKeys, attentionState, settledAttentionState, generation, recordAppOutbound } from "../whatsapp/attention";
import { isExcludedContact } from "../whatsapp/conversation-policy";
import { renderTemplate } from "./templates";
import { aInternacional, esMexicano } from "../../utils/phone";
import type { RedisClientType } from "redis";

export interface NotificationJob {
  id: string;
  type: "whatsapp";
  to: string; // 10-digit MX phone
  template: string;
  params: Record<string, string>;
  attempts: number;
  createdAt: string;
  confirmation?: { checkoutId: string; code: string };
  automation?: { generation: number; handoffId?: string; revision?: string };
  staffNotification?: boolean;
}

/**
 * Build a wa.me link with a pre-filled message (fallback / MVP).
 */
export function buildWALink(phone: string, message: string): string {
  // Respeta números extranjeros (ya guardados con su clave de país).
  const international = aInternacional(phone);
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
 * ¿La sesión de WhatsApp está realmente conectada?
 *
 * Hace falta porque Evolution acepta un envío (responde 2xx) aunque el
 * teléfono esté desvinculado: el mensaje se queda en su cola y NUNCA se
 * entrega. Sin esta comprobación le decíamos al cliente "te mandamos el
 * código" y se quedaba esperando para siempre.
 *
 * Devuelve el estado ("open" = conectado) o null si no se pudo consultar.
 */
export async function evolutionEstaConectado(): Promise<{
  configurado: boolean;
  conectado: boolean;
  estado: string;
}> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!apiUrl || !apiKey || !instance) {
    return { configurado: false, conectado: false, estado: "not_configured" };
  }

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { configurado: true, conectado: false, estado: `http_${res.status}` };

    const data = (await res.json()) as any;
    const lista = Array.isArray(data) ? data : [];
    const inst = lista.find((i: any) => i.name === instance || i.instance?.instanceName === instance);
    if (!inst) return { configurado: true, conectado: false, estado: "not_created" };

    const estado = inst.connectionStatus ?? inst.instance?.state ?? "unknown";
    return { configurado: true, conectado: estado === "open", estado };
  } catch {
    return { configurado: true, conectado: false, estado: "error" };
  }
}

/**
 * ¿Ese número tiene WhatsApp?
 *
 * Evolution acepta enviar a cualquier número y responde 2xx aunque el destino
 * no exista en WhatsApp: el mensaje simplemente se pierde. Comprobarlo antes
 * evita decirle a un cliente "te mandamos el código" cuando su número no tiene
 * WhatsApp (o escribió otro por error).
 *
 * En México conviven dos formatos de JID (52… y 521…), así que se prueban los
 * dos y basta con que uno exista.
 *
 * Devuelve `null` si no se pudo comprobar (ahí no bloqueamos: mejor intentar).
 */
export async function numeroTieneWhatsApp(
  telefonoGuardado: string
): Promise<boolean | null> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!apiUrl || !apiKey || !instance) return null;

  // En México conviven dos formatos de JID (52… y 521…); se prueban ambos.
  // Los extranjeros ya vienen completos.
  const candidatos = esMexicano(telefonoGuardado)
    ? [`52${telefonoGuardado}`, `521${telefonoGuardado}`]
    : [aInternacional(telefonoGuardado)];

  try {
    const res = await fetch(
      `${apiUrl.replace(/\/$/, "")}/chat/whatsappNumbers/${instance}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ numbers: candidatos }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;

    const data = (await res.json()) as any;
    const lista = Array.isArray(data) ? data : data?.numbers ?? [];
    if (!Array.isArray(lista) || lista.length === 0) return null;

    return lista.some((n: any) => n?.exists === true || n?.numberExists === true);
  } catch {
    return null; // no se pudo comprobar → no bloquear al cliente
  }
}

// Rechecked immediately before every provider request, including button fallback.
// Old jobs are invalid after an operator resume, even if a retry is delayed.
async function maySend(job: NotificationJob, redis?: RedisClientType, ownLease = false) {
  if (job.template !== "bot_reply") return true;
  if (process.env.WHATSAPP_BOT_ENABLED !== "true") return false;
  if (job.staffNotification) return true;
  if (!redis || !job.automation || isExcludedContact(job.to)) return false;
  if (job.automation.generation !== await generation(redis, job.to)) return false;
  if (job.automation.revision && job.automation.revision !== await redis.get(`wa:bot:${job.to}:reply-revision`)) return false;
  const state = ownLease ? await attentionState(redis, job.to) : await settledAttentionState(redis, job.to);
  if (state === "automatic") return true;
  // Only the acknowledgement which established this customer-requested
  // handoff may pass. Any staff intervention still cancels it immediately.
  return Boolean(job.automation.handoffId) &&
    await redis.get(attentionKeys(job.to).human) === `handoff:${job.automation.handoffId}` &&
    await redis.sCard(attentionKeys(job.to).unknown) === 0;
}

/**
 * Evolution API sender.
 * Env vars required:
 *   EVOLUTION_API_URL     → base URL (e.g. https://evolution.yourdomain.com)
 *   EVOLUTION_API_KEY     → apikey header value
 *   EVOLUTION_INSTANCE    → instance name (e.g. "pollon-sjr")
 *   EVOLUTION_COUNTRY_CODE → defaults to "52" (MX)
 */
export async function sendWhatsAppEvolution(job: NotificationJob, redis?: RedisClientType): Promise<void> {
  // Briefly allow consecutive customer details to replace a queued prompt.
  // This is bounded, applies only to bot checkout replies, and is followed by
  // the full revision/human-takeover check before any provider request.
  if (job.template === "bot_reply" && job.automation?.revision && !job.automation.handoffId) {
    const wait = Math.min(1200, Date.parse(job.createdAt) + 1200 - Date.now());
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  }
  if (!await maySend(job, redis)) return;
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  const countryCode = process.env.EVOLUTION_COUNTRY_CODE || "52";

  if (!apiUrl || !apiKey || !instance) {
    if (job.template === "bot_reply") throw new Error("Bot sender not configured");
    // Missing config → fall back to MVP log
    return sendWhatsAppMVP(job);
  }

  if (!redis) throw new Error("Outbound message tracking requires Redis");
  const leaseKey = attentionKeys(job.to).sending;
  const lease = crypto.randomUUID();
  if (!await redis.set(leaseKey, lease, { NX: true, EX: 60 })) throw new Error("WhatsApp sender busy; retry send");
  try {
    const body = renderTemplate(job.template, job.params);
    // México se guarda con 10 dígitos (se le antepone la clave); los extranjeros
    // ya la traen, así que NO se les vuelve a poner.
    const number = esMexicano(job.to) ? `${countryCode}${job.to}` : job.to;

    const headers = { "Content-Type": "application/json", apikey: apiKey };
    let res: Response | undefined;
    if (job.confirmation && process.env.WHATSAPP_REPLY_BUTTONS === "true") {
      if (!await maySend(job, redis, true)) return;
      res = await fetch(`${apiUrl.replace(/\/$/, "")}/message/sendButtons/${encodeURIComponent(instance)}`, {
        method: "POST", headers, signal: AbortSignal.timeout(12000),
        body: JSON.stringify({ number, title: "Revisa tu pedido", description: body,
          buttons: [{ type: "reply", displayText: "Confirmar pedido", id: `wa_confirm:${job.confirmation.checkoutId}:${job.confirmation.code}` }] }),
      });
      // Only a definite unsupported request can fall back. On an ambiguous
      // timeout or 5xx, let the existing queue retry the same confirmation.
      if ([400, 404, 405, 422].includes(res.status)) res = undefined;
    }
    if (!res && !await maySend(job, redis, true)) return;
    res ??= await fetch(`${apiUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        number,
        text: body,
        // Optional Evolution API params:
        delay: 0,
        linkPreview: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Evolution API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const sent = await res.json() as { key?: { id?: string } };
    if (!sent.key?.id || typeof sent.key.id !== "string" || sent.key.id.length > 200) throw new Error("Outbound message ID missing");
    await recordAppOutbound(redis, job.to, sent.key.id);
    if (job.confirmation) {
      await redis.set(`wa:summary:${job.to}:${job.confirmation.checkoutId}:${job.confirmation.code}`, sent.key.id, { EX: 600 });
    }

    console.log(`📤 WA [${job.template}] → +${number} (Evolution OK)`);
  } finally {
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", { keys: [leaseKey], arguments: [lease] });
  }
}

/**
 * Smart default: if Evolution API is configured, use it; otherwise fall back to MVP (log only).
 */
export async function sendWhatsApp(job: NotificationJob, redis?: RedisClientType): Promise<void> {
  if (!await maySend(job, redis)) return;
  if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE) {
    return sendWhatsAppEvolution(job, redis);
  }
  if (job.template === "bot_reply") throw new Error("Bot sender not configured");
  return sendWhatsAppMVP(job);
}
