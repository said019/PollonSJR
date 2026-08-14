import { renderTemplate } from "./templates";
import { aInternacional, esMexicano } from "../../utils/phone";

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
  // México se guarda con 10 dígitos (se le antepone la clave); los extranjeros
  // ya la traen, así que NO se les vuelve a poner.
  const number = esMexicano(job.to) ? `${countryCode}${job.to}` : job.to;

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
