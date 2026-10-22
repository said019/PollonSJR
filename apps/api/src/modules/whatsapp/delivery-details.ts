import { normalizarTelefono } from "../../utils/phone";

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export type DeliveryDetails = { name?: string; address?: string; facade?: string; phone?: string; error?: string };
const phoneLabel = /\b(?:telefono|tel|celular|cel|numero (?:de |para )?(?:contacto|entrega)|contacto)\b/;
const street = /^(?:(?:si|claro|es|mi|la|direccion|domicilio|en|entregar|estoy|vivo)\s*[:,.]?\s+)*(?:calle|avenida|av\.?|privada|priv\.?|andador|carretera|boulevard|bulevar|circuito|cerrada)\s+\S/;
export function hasFacade(text: string): boolean {
  return /\b(?:fachada|porton|puerta|reja|zagu[aá]n|cortina|entrada|letrero)\b|\b(?:es |es un |es una |un |una )?(?:local|casa|edificio) (?:de |color |con |azul|roja|verde|blanca|amarilla)/.test(normalize(text));
}
export function validRecipient(text: string): boolean {
  const n = normalize(text);
  return text.length >= 2 && text.length <= 80 && /^[\p{L}][\p{L} .’'\-]*$/u.test(text) &&
    !/\b(?:hola|buenas|buenos|gracias|claro|listo|efectivo|exacto|notas|pedido|piezas|pure|ensalada|domicilio|recoger|envio|calle|avenida|telefono|numero|ubicacion|asesor|confirmar|cancelar|si|no|ok)\b/.test(n);
}

// Extract only explicitly recognizable customer data. Never infer coordinates,
// change a misspelled street/name, or turn a customer-supplied number into a fee.
export function parseDeliveryDetails(text: string, step: string, senderPhone: string): DeliveryDetails | null {
  const raw = text.trim(); const n = normalize(raw);
  if (!raw || /[?¿]/.test(raw)) return null;
  if (/^(?:este(?: mismo)?(?: numero)?|el mismo(?: numero)?|a este numero|al mismo numero)[.! ]*$/.test(n)) {
    return { phone: senderPhone };
  }
  // Keep combined labelled messages atomic: do not silently lose an unknown line.
  const lines = raw.split(/\n|;|,\s*(?=(?:nombre|tel[eé]fono|contacto)\s*:)/i).map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) {
    const result: DeliveryDetails = {};
    for (const line of lines) {
      const part = parseDeliveryDetails(line, step, senderPhone);
      if (!part) return null;
      if (part.error) return part;
      for (const [key, value] of Object.entries(part)) {
        if (result[key as keyof DeliveryDetails] && result[key as keyof DeliveryDetails] !== value) return { error: "Veo dos datos distintos para el mismo campo. ¿Me los mandas por separado para anotarlos bien?" };
        result[key as keyof DeliveryDetails] = value;
      }
    }
    return result;
  }
  if (street.test(n)) {
    if (raw.length > 500) return { error: "¿Me mandas la dirección y la referencia en máximo 500 caracteres?" };
    // A written address needs a number (or an explicit S/N), not just a street.
    if (!/\d|\bsin numero\b|\bs\s*\/\s*n\b/.test(n)) return { error: "Ya vi la calle. ¿Me mandas también el número, o me dices si no tiene?" };
    return { address: raw, ...(hasFacade(raw) ? { facade: raw } : {}) };
  }
  if (phoneLabel.test(n) || /^[+\d\s().-]{7,}$/.test(raw)) {
    const candidate = raw.match(/\+?\d[\d\s().-]{6,}\d/);
    const remaining = candidate ? normalize(raw.replace(candidate[0], "")).replace(/[.:,()]/g, "").trim() : n;
    const recognized = /^(?:(?:mi|el|es|para|de|la|entrega|numero|telefono|tel|celular|cel|contacto)\s*)*$/.test(remaining);
    const phone = candidate && recognized ? normalizarTelefono(candidate[0]) : null;
    if (!phone) return { error: "¿Me confirmas el teléfono para la entrega con 10 dígitos? También puedes decir ESTE NÚMERO si usamos el de este chat." };
    return { phone };
  }
  if (hasFacade(raw)) {
    if (raw.length > 250) return { error: "¿Me das una referencia de tu fachada en máximo 250 caracteres?" };
    return { facade: raw };
  }
  const name = raw.replace(/^(?:(?:mi )?nombre(?: es)?|a nombre de|me llamo)\s*:?\s*/i, "");
  if ((name !== raw || step === "name") && validRecipient(name)) return { name };
  return null;
}

export function deliveryAddress(s: { address?: string; facade?: string }): string | undefined {
  if (!s.address) return undefined;
  return s.facade && !s.address.includes(s.facade) ? `${s.address}. Fachada: ${s.facade}` : s.address;
}
export function orderNotes(s: { name?: string; deliveryPhone?: string; type?: string; notes?: string; pickupRequest?: string }): string {
  return `[WhatsApp] A nombre de: ${s.name}${s.type === "DELIVERY" && s.deliveryPhone ? `. Teléfono para entrega: ${s.deliveryPhone}` : ""}${s.type === "PICKUP" && s.pickupRequest ? `. Solicitud: ${s.pickupRequest} (hora no confirmada)` : ""}${s.notes ? ". " + s.notes : ""}`;
}
