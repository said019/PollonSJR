import { exactCatalogRequest } from "./catalog-request";
import crypto from "node:crypto";
import { parseDeliveryDetails, validRecipient, deliveryAddress, orderNotes, hasFacade } from "./delivery-details";
import { isTextOrderCandidate, parseTextOrder, resolveTextOrder, applySideSizes, correctUnknownLine, type TextOrderDraft, type QueuedProduct } from "./text-order";
import { answerQuestion, isQuestion, asksCurrentService } from "./questions";
import { writeReply } from "./reply-writer";
import { requestPolicyReply } from "./request-policy";
import { settledAttentionState, attentionKeys, generation } from "./attention";
import { isDeliveryReference, repeatsImageReference } from "./image-request";
import { manualTopic, manualTopicReply, isExcludedContact } from "./conversation-policy";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { OrdersService } from "../orders/orders.service";
import { createOrderSchema } from "../orders/orders.schema";
import { DeliveryService } from "../delivery/delivery.service";
import { isAcceptingOrders, getStoreConfig } from "../admin/store-config.service";
import { normalizarTelefono } from "../../utils/phone";
import { interpretWithClaude, validateDecision, type Choice, type Interpreter } from "./claude-interpreter";
import { geocodeAddress, type Geocoder, type AddressCandidate } from "./geocoder";
import { resolveCatalog, catalogUrl, type CatalogSelection } from "./catalog";
import { WhatsAppMemory, type RememberedBasket } from "./memory";

const priceOption = z.object({ label: z.string(), price: z.number().int().nonnegative() });
const modifier = z.object({
  name: z.string(), required: z.boolean(), minSelect: z.number(), maxSelect: z.number(),
  totalQuota: z.number().nullable(), options: z.array(priceOption),
});
export const productSchema = z.object({
  id: z.string(), name: z.string(), price: z.number().int().nonnegative(),
  variants: z.array(priceOption).nullable(), modifiers: z.array(modifier),
});
type Product = z.infer<typeof productSchema>;
type Item = {
  productId: string; name: string; qty: number; unitPrice: number; variant?: string;
  modifiers: Array<{ name: string; option: string; price: number; qty: number }>;
  configuration: string;
};
type Step = "catalog_recovery" | "bundle" | "menu" | "quantity" | "variant" | "modifier" | "more" | "name" | "type" |
  "location" | "location_check" | "address" | "address_choice" | "address_confirm" | "delivery_details" | "notes" | "payment" | "cash" | "confirm" | "done" | "human" | "reuse";
export type Session = {
  step: Step; checkoutId: string; catalog: Product[]; items: Item[];
  closedPendingConfirmation?: boolean;
  textOrder?: TextOrderDraft;
  lastTextOrder?: string;
  batchOrder?: boolean;
  skipOptionalModifiers?: boolean;
  imageRequest?: { caption: string };
  deliveryReference?: string;
  pending?: Item; selected?: Product; modifierIndex?: number; name?: string;
  type?: "PICKUP" | "DELIVERY"; lat?: number; lng?: number; address?: string;
  facade?: string; deliveryPhone?: string;
  pickupRequest?: string;
  locationNeedsCheck?: boolean;
  notes?: string; cashAmount?: number; fee?: number; total?: number; orderNumber?: number;
  aiProposal?: { step: Step; code: string; label: string; expiresAt: number };
  confirmation?: { code: string; expiresAt: number };
  addressCandidates?: AddressCandidate[];
  candidate?: AddressCandidate;
  queuedProducts?: QueuedProduct[];
  catalogVariant?: string;
  catalogRecoveryAttempts?: number;
  pendingCatalogRequest?: { messageId: string; sellerJid: string; orderId?: string; lines?: CatalogSelection["lines"] };
  reuseItems?: Item[];
  pendingMemory?: { note?: string; basket?: RememberedBasket; expiresAt: number };
};
export type BotReply = { session: Session | null; text: string; handoff?: boolean };
export type Incoming = {
  id: string; phone: string; text: string; fromMe: boolean;
  location?: { lat: number; lng: number };
  replyTo?: string;
  buttonId?: string;
  catalogSelection?: CatalogSelection;
  unsupportedMedia?: boolean;
  hasImage?: boolean;
};
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const normalize = (text: string) => text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const requestsHuman = (text: string) => /^(?:por favor[, ]+)?(?:hablar con (?:una? )?(?:persona|asesor|alguien)|(?:quiero|quisiera|necesito) (?:hablar con )?(?:una? )?(?:asesor|persona|humano|ayuda|alguien)|me (?:atiende|puede atender) alguien)[.!?\s]*$/.test(text);
const needsHumanReview = (text: string) => /\b(?:alergias?|alergic[oa]s?|celiac[oa]s?|anafilaxia)\b/.test(text) || /(?:garant|segur).{0,50}(?:sin|libre de).{0,20}(?:gluten|alergenos|cacahuate|huevo|leche)/.test(text);
const requestsCancel = (text: string) => /^(?:por favor[, ]+)?(?:cancela(?:r|lo)?(?: (?:mi|el|este) (?:pedido|borrador))?|quiero cancelar(?: (?:mi|el) pedido)?|ya no quiero(?: (?:el|mi) pedido)?)[.!?\s]*$/.test(text);
const requestsOrderChange = (text: string) => /\b(?:cambia(?:r|me)?|cambial[oa]|modifica(?:r)?|corrige|corregir|quita(?:r)?).{0,50}\b(?:direccion|domicilio|pedido|producto|cantidad|entrega|pago|nombre)\b/.test(text);
const asksIdentity = (text: string) => /\b(?:eres|hablo con|estoy hablando con|me atiende)\b.*\b(?:bot|robot|human[oa]|persona|real|virtual|ia|inteligencia artificial|chatgpt)\b|\b(?:quien eres|quien me atiende|quien responde|como te llamas|con quien hablo|con quien estoy hablando)\b/.test(text);
const isGreeting = (text: string) => /^(?:(?:hola+|ola|holi|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que tal)\s*)+$/.test(text.replace(/[^\p{L}\p{N}\s]/gu, "").trim());
const browsesMenu = (text: string) => /\bque (?:venden|ofrecen)\b/.test(text) || /\b(?:menu|catalogo|carta)\b/.test(text) && /\b(?:ver|pasas|pasar|mandas|mandame|muestras|mostrar|tienes|tienen|consultar|conocer)\b/.test(text) || /^(?:el |tu )?(?:menu|catalogo|carta)[.!?¿¡\s]*$/.test(text);
const asksMenu = (text: string) => /^(?:pedir|nuevo|menu|quiero pedir|quiero hacer un pedido|me pasas el menu|mandame el menu|me mandas el menu|tienes menu|puedo ver el menu)$/.test(text.replace(/[.!?¿¡]/g, "").trim());
const help = "\n\nEscribe ASESOR para atención personal o CANCELAR para descartar este borrador.";
const incomingDetails = (input: Incoming, step: string) => {
  if (asksCurrentService(input.text)) return null;
  const details = parseDeliveryDetails(input.text, step, input.phone);
  return details?.name && !details.address && !details.phone && isQuestion(input.text) ? null : details;
};
const pickupRequest = (text: string) => /^(?:voy a|paso a|ire a|voy por|paso por) (?:recoger(?:lo|los| el pedido)?|el pedido)(?: en \d{1,3} (?:min|minutos?))?[.! ]*$/.test(normalize(text));

// Do not interpret group IDs or privacy LIDs as phone numbers. Some versions
// provide remoteJidAlt for a LID; only use it when it is a genuine phone JID.
export function parseIncoming(raw: unknown, now = Date.now()): Incoming | null {
  // Baileys can wrap messages when the chat has disappearing messages on.
  const envelope = z.object({ message: z.record(z.unknown()).optional() }).passthrough().safeParse(raw);
  if (!envelope.success) return null;
  let unwrapped = envelope.data.message;
  for (let depth = 0; depth < 3 && unwrapped; depth++) {
    const wrapper = unwrapped.ephemeralMessage ?? unwrapped.viewOnceMessage ?? unwrapped.viewOnceMessageV2;
    if (!wrapper) break;
    const nested = z.object({ message: z.record(z.unknown()) }).safeParse(wrapper);
    if (!nested.success) return null;
    unwrapped = nested.data.message;
  }
  if (unwrapped?.protocolMessage || unwrapped?.reactionMessage) return null;
  const parsed = z.object({
    key: z.object({ id: z.string().min(1).max(200), fromMe: z.boolean(), remoteJid: z.string(), remoteJidAlt: z.string().optional() }),
    messageTimestamp: z.union([z.number(), z.string()]).optional(),
    message: z.object({
      conversation: z.string().optional(), extendedTextMessage: z.object({ text: z.string().optional(), contextInfo: z.object({ stanzaId: z.string().max(200).optional() }).optional() }).optional(),
      locationMessage: z.object({ degreesLatitude: z.number().min(-90).max(90), degreesLongitude: z.number().min(-180).max(180) }).optional(),
      productMessage: z.object({ businessOwnerJid: z.string(), product: z.object({ productId: z.string().min(1).max(100) }) }).optional(),
      orderMessage: z.object({ sellerJid: z.string(), orderId: z.string().min(1).max(100), token: z.string().min(1).max(4096), itemCount: z.number().int().min(1).max(100).optional() }).optional(),
      buttonsResponseMessage: z.object({ selectedButtonId: z.string().max(200) }).optional(),
      templateButtonReplyMessage: z.object({ selectedId: z.string().max(200) }).optional(),
      interactiveResponseMessage: z.object({ nativeFlowResponseMessage: z.object({ paramsJson: z.string().max(4096) }) }).optional(),
    }).passthrough().optional(),
  }).safeParse({ ...envelope.data, message: unwrapped });
  if (!parsed.success) return null;
  const m = parsed.data;
  let jid = m.key.remoteJid;
  if (jid.endsWith("@lid")) jid = m.key.remoteJidAlt || "";
  if (!/^\d{11,15}@s\.whatsapp\.net$/.test(jid)) return null;
  if (m.messageTimestamp) {
    const timestamp = Number(m.messageTimestamp) * 1000;
    if (!Number.isFinite(timestamp) || now - timestamp > 86400000 || timestamp - now > 300000) return null;
  }
  const digits = jid.split("@")[0];
  const phone = digits.startsWith("52") ? normalizarTelefono(digits) : digits;
  if (!phone) return null;
  const photo = z.object({ caption: z.string().max(1000).optional() }).passthrough().safeParse(m.message?.imageMessage);
  const text = m.message?.conversation || m.message?.extendedTextMessage?.text || (photo.success ? photo.data.caption : "") || "";
  if (text.length > 1000 && !m.key.fromMe) return null;
  const loc = m.message?.locationMessage;
  const product = m.message?.productMessage;
  const order = m.message?.orderMessage;
  let buttonId = m.message?.buttonsResponseMessage?.selectedButtonId || m.message?.templateButtonReplyMessage?.selectedId;
  const native = m.message?.interactiveResponseMessage?.nativeFlowResponseMessage.paramsJson;
  if (native) {
    try { buttonId = z.object({ id: z.string().max(200) }).parse(JSON.parse(native)).id; } catch { return null; }
  }
  const unsupportedMedia = ["imageMessage", "audioMessage", "videoMessage", "documentMessage", "stickerMessage", "contactMessage", "contactsArrayMessage"].some(k => Boolean(m.message?.[k]));
  // Reactions, receipts and protocol events must not start conversations.
  if (!text && !loc && !product && !order && !buttonId && !unsupportedMedia) return null;
  return { id: m.key.id, phone, text: text.slice(0, 1000), fromMe: m.key.fromMe,
    ...(unsupportedMedia ? { unsupportedMedia: true } : {}),
    ...(photo.success ? { hasImage: true } : {}),
    replyTo: m.message?.extendedTextMessage?.contextInfo?.stanzaId,
    buttonId,
    ...(product ? { catalogSelection: { sellerJid: product.businessOwnerJid, lines: [{ id: product.product.productId, quantity: 1 }], singleProduct: true } } : {}),
    ...(order ? { catalogSelection: { sellerJid: order.sellerJid, orderId: order.orderId, token: order.token, ...(order.itemCount !== undefined ? { itemCount: order.itemCount } : {}) } } : {}),
    ...(loc ? { location: { lat: loc.degreesLatitude, lng: loc.degreesLongitude } } : {}) };
}

export function parseSelection(text: string, count: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const index = Number(text.trim()) - 1;
  return index >= 0 && index < count ? index : null;
}

export function selectModifiers(text: string, mod: Product["modifiers"][number]) {
  if (normalize(text) === "omitir" && !mod.required && mod.minSelect === 0 && !mod.totalQuota) return [];
  // Exact catalog labels are already explicit choices, not an AI guess.
  // Consume the whole phrase so extra instructions cannot change the order.
  let selection = text.trim();
  if (!/^\d+(?:\s*,\s*\d+)*$/.test(selection)) {
    const label = normalize(selection).replace(/[.!]+$/, "").trim()
      .replace(/^(?:con (?:la )?(?:salsa (?:de )?)?|salsa (?:de )?)/, "")
      .replace(/ por favor$/, "").trim();
    const matches = mod.options.map((option, index) => ({ option, index }))
      .filter(({ option }) => normalize(option.label) === label);
    if (matches.length !== 1) return null;
    selection = String(matches[0].index + 1);
  }
  const picks = selection.split(/\s*,\s*/).map(Number);
  const minimum = mod.totalQuota ?? Math.max(mod.minSelect, mod.required ? 1 : 0);
  const maximum = mod.totalQuota ?? mod.maxSelect;
  if (picks.length < minimum || picks.length > maximum || picks.some(n => n < 1 || n > mod.options.length)) return null;
  if (!mod.totalQuota && new Set(picks).size !== picks.length) return null;
  return [...new Set(picks)].map(n => ({
    name: mod.name, option: mod.options[n - 1].label, price: mod.options[n - 1].price,
    qty: picks.filter(p => p === n).length,
  }));
}

function itemTotal(item: Item) {
  return item.qty * (item.unitPrice + item.modifiers.reduce((sum, m) => sum + m.price * m.qty, 0));
}
function menu(s: Session) {
  return `🍗 Menú de Pollón\nTambién puedes elegir aquí: ${catalogUrl()}\n\n` + s.catalog.map((p, i) =>
    `${i + 1}. ${p.name} — ${p.variants?.length ? "desde " + money(Math.min(...p.variants.map(v => v.price))) : money(p.price)}`
  ).join("\n") + "\n\nDime el número de lo que se te antoja." + help;
}
function modifierPrompt(s: Session) {
  const m = s.selected!.modifiers[s.modifierIndex!];
  if ((m.totalQuota ?? m.maxSelect) === 1 && (m.required || m.minSelect === 1 || m.totalQuota === 1))
    return `¿Qué ${m.name.toLowerCase()} prefieres? ` + m.options.map(o => `${o.label}${o.price ? " (+" + money(o.price) + ")" : ""}`).join(", ") + ". Puedes decirme el nombre.";
  return `${m.name}:\n` + m.options.map((o, i) => `${i + 1}. ${o.label}${o.price ? " (+" + money(o.price) + ")" : ""}`).join("\n") +
    (m.totalQuota ? `\nElige ${m.totalQuota} en total; puedes repetir (ejemplo: 1,1,2).` :
      `\nElige de ${Math.max(m.minSelect, m.required ? 1 : 0)} a ${m.maxSelect}, separados por comas.`) +
    (!m.required && m.minSelect === 0 && !m.totalQuota ? " Escribe OMITIR si no deseas agregar." : "");
}
function checkoutPrompt(s: Session): string {
  if (!s.name) { s.step = "name"; return "¿A qué nombre lo ponemos?"; }
  if (!s.type) { s.step = "type"; return "¿Pasas a recoger o te lo llevamos?\n1. Recoger en el local\n2. A domicilio"; }
  if (s.type === "DELIVERY" && s.locationNeedsCheck) { s.step = "location_check"; return "¿La ubicación que ya mandaste corresponde a esta dirección? Responde SÍ o NO; si es la misma, no hace falta enviarla otra vez."; }
  if (s.type === "DELIVERY" && (s.lat === undefined || s.lng === undefined)) { s.step = "location"; return "Compárteme tu ubicación para revisar el envío."; }
  if (s.type === "DELIVERY" && !s.address) { s.step = "address"; return "Ya tengo tu ubicación. Sólo me faltan la calle, el número y las referencias de entrega."; }
  if (s.type === "DELIVERY" && (!s.facade || !s.deliveryPhone)) {
    s.step = "delivery_details";
    return !s.facade ? "¿Cómo identificamos tu fachada? Puede ser el color de la puerta, el portón o el letrero del local." : "¿A qué teléfono te contactamos para la entrega? Puedes decir ESTE NÚMERO si usamos el de este chat.";
  }
  if (s.notes !== undefined) {
    s.step = "payment";
    return "¿Pagas en efectivo? Escribe EFECTIVO para seguir. Si prefieres otro medio de pago, escribe ASESOR y lo revisas con el equipo.";
  }
  s.step = "notes"; return "¿Cómo te lo preparamos? Déjame tus indicaciones o escribe SIN NOTAS.";
}
function nextModifier(s: Session): string {
  while (s.modifierIndex! < s.selected!.modifiers.length) {
    const m = s.selected!.modifiers[s.modifierIndex!];
    if (s.pending!.modifiers.some(p=>p.name===m.name) || s.skipOptionalModifiers && !m.required && m.minSelect===0 && !m.totalQuota) s.modifierIndex!++;
    else break;
  }
  if (s.modifierIndex! < s.selected!.modifiers.length) {
    s.step = "modifier";
    return modifierPrompt(s);
  }
  s.items.push(s.pending!);
  delete s.pending; delete s.selected; delete s.skipOptionalModifiers;
  if (s.queuedProducts?.length) return beginQueuedProduct(s);
  if (s.batchOrder) { delete s.batchOrder; return "Ya tengo los productos. " + checkoutPrompt(s); }
  s.step = "more";
  return "Agregado ✅\n" + s.items.map(i => `${i.qty} × ${i.name}${i.variant ? " (" + i.variant + ")" : ""}: ${money(itemTotal(i))}`).join("\n") +
    "\n\n¿Algo más? Escribe MÁS para agregar o LISTO para seguir.";
}

function beginQueuedProduct(s: Session): string {
  const entry = s.queuedProducts!.shift()!;
  const p = s.catalog.find(p => p.id === entry.productId)!;
  s.selected = p; s.modifierIndex = 0; s.skipOptionalModifiers = entry.skipOptional;
  const variant = p.variants?.find(v => v.label === entry.variant);
  s.pending = { productId: p.id, name: p.name, qty: entry.qty, unitPrice: variant?.price ?? p.price,
    ...(variant ? { variant: variant.label } : {}), modifiers: entry.modifiers ?? [], configuration: JSON.stringify(p) };
  if (p.variants?.length && !variant) {
    s.step = "variant";
    return `${entry.qty} × ${p.name}. Elige la presentación:\n` + p.variants.map((v, i) => `${i + 1}. ${v.label} — ${money(v.price)}`).join("\n");
  }
  return nextModifier(s);
}

export class WhatsAppBot {
  constructor(private app: FastifyInstance, private interpret: Interpreter = interpretWithClaude, private geocode: Geocoder = geocodeAddress) {}

  private selectionLabel(s: Session, choice: Choice): string {
    // Model-facing labels explain workflow constraints. Customer copy should
    // show the selection itself, without exposing those implementation notes.
    switch (s.step) {
      case "menu": return s.catalog[Number(choice.code) - 1]?.name ?? choice.label;
      case "quantity": return `${choice.code} × ${s.selected!.name}`;
      case "more": return choice.code === "mas" ? "Agregar algo más" : "Seguir con tu pedido";
      case "type": return choice.code === "1" ? "Recoger en el local" : "Envío a domicilio";
      default: return choice.label;
    }
  }

  private choices(s: Session): Choice[] {
    switch (s.step) {
      case "menu": return s.catalog.map((p, i) => ({ code: String(i + 1), label: `Producto: ${p.name} (la cantidad y las opciones se preguntan después)` }));
      case "quantity": return Array.from({ length: 20 }, (_, i) => ({ code: String(i + 1), label: `${i + 1} unidades de ${s.selected!.name}` }));
      case "variant": return (s.selected?.variants ?? []).map((v, i) => ({ code: String(i + 1), label: `${v.label} — ${money(v.price)}` }));
      case "modifier": {
        const mod = s.selected?.modifiers[s.modifierIndex ?? 0];
        // Multiple/repeated choices remain explicit to avoid losing quantities.
        if (!mod || (mod.totalQuota ?? mod.maxSelect) !== 1) return [];
        return mod.options.map((o, i) => ({ code: String(i + 1), label: `${mod.name}: ${o.label} (+${money(o.price)})` }));
      }
      case "more": return [{ code: "mas", label: "Agregar otro producto" }, { code: "listo", label: "Continuar con los datos del pedido" }];
      case "type": return [{ code: "1", label: "Recoger en sucursal" }, { code: "2", label: "Entrega a domicilio (se verificará cobertura y tarifa)" }];
      default: return [];
    }
  }

  async advanceWithAI(s: Session | null, input: Incoming): Promise<BotReply> {
    const text = normalize(input.text);
    if (isExcludedContact(input.phone) || (!input.fromMe && manualTopic(input.text))) return this.advance(s, input);
    if (!input.fromMe && requestPolicyReply(input.text)) return this.advance(s, input);
    if (!input.fromMe && s?.imageRequest && (isDeliveryReference(input.text) || repeatsImageReference(input.text))) return this.advance(s, input);
    if (!input.fromMe && browsesMenu(text)) return this.advance(s, input);
    if (!input.fromMe && requestsCancel(text)) return this.advance(s, { ...input, text: "cancelar" });
    if (!input.fromMe && ((s?.step === "bundle" || s?.step === "catalog_recovery") || ((!s || ["menu", "more"].includes(s.step)) && isTextOrderCandidate(input.text)))) return this.advance(s, input);
    if (s && !input.fromMe && ["menu", "more", "modifier", "variant"].includes(s.step) &&
        exactCatalogRequest(input.text, await this.catalog())) return this.advance(s, input);
    if (!s && !input.fromMe) {
      // Initialize through the usual store/catalog/command checks, then use
      // the customer's actual first message instead of asking them to repeat it.
      const initial = await this.advance(null, input);
      const draft = initial.session;
      if (!draft || draft.step !== "menu" || draft.pendingMemory || input.location || input.catalogSelection || input.buttonId || input.unsupportedMedia ||
          isGreeting(text) || asksMenu(text) || /^\d+$/.test(text) || ["elegir", "confirmar"].includes(text) ||
          process.env.WHATSAPP_AI_ENABLED !== "true" || !process.env.ANTHROPIC_API_KEY) return initial;
      const reply = await this.advanceWithAI(draft, input);
      return reply;
    }
    // No model call may bypass an operator pause, explicit command, location
    // validation, payment, personal data collection or final confirmation.
    if (!s || input.fromMe || input.location || input.catalogSelection || input.buttonId || input.unsupportedMedia || !text || asksIdentity(text) || requestsHuman(text) || needsHumanReview(text) || requestsOrderChange(text) ||
        /^(preferencia:|guardar|recordar|mis preferencias|borrar preferencias|usar preferencia|lo de siempre|repetir pedido)/.test(text) ||
        ["human", "done", "confirm", "name", "address", "delivery_details", "notes", "payment", "cash", "location", "location_check"].includes(s.step) ||
        !!incomingDetails(input, s.step) || pickupRequest(input.text) ||
        ["cancelar", "asesor", "ayuda", "persona", "recoger", "menu", "omitir"].includes(text)) {
      if (s) delete s.aiProposal;
      return this.advance(s, input);
    }
    if (s.step === "modifier" && s.selected &&
        selectModifiers(input.text, s.selected.modifiers[s.modifierIndex ?? 0])) return this.advance(s, input);
    const availability = await isAcceptingOrders(this.app);
    if (!availability.accepting) {
      return this.unavailable(s, input.text, availability);
    }
    const choices = this.choices(s);
    const proposal = s.aiProposal;
    delete s.aiProposal;
    if (text === "elegir") {
      if (proposal && proposal.expiresAt > Date.now() && proposal.step === s.step &&
          choices.some(c => c.code === proposal.code && c.label === proposal.label)) {
        return this.advance(s, { ...input, text: proposal.code });
      }
      return { session: s, text: "Esa interpretación venció. Responde con la opción del menú actual; tu pedido todavía no se ha confirmado." };
    }
    if (process.env.WHATSAPP_AI_ENABLED !== "true" || !process.env.ANTHROPIC_API_KEY || !choices.length ||
        choices.some(c => c.code === text) || /^\d+(?:\s*,\s*\d+)*$/.test(text)) {
      return this.advance(s, input);
    }
    // The handler holds the per-phone lock, so this budget survives restarting
    // a draft and is not reset by CANCELAR. At most 20 API calls / 10 minutes.
    const budgetKey = `wa:ai:budget:${input.phone}:${Math.floor(Date.now() / 600000)}`;
    const count = Number(await this.app.redis.get(budgetKey) || "0");
    if (count >= 20) return this.advance(s, input);
    await this.app.redis.set(budgetKey, String(count + 1), { EX: 660 });
    const context = { step: s.step, choices, message: input.text };
    const decision = validateDecision(await this.interpret(context).catch(() => null), context);
    if (!decision) return this.advance(s, input);
    if (decision.action === "human") return this.advance(s, { ...input, text: "asesor" });
    if (decision.action === "clarify") return { session: s, text: s.step === "menu" && !s.items.length
      ? "¿Quieres consultar algo del menú o hacer un pedido?"
      : "¿Cuál de las opciones prefieres? Todavía no he cambiado tu pedido." };
    const choice = choices.find(c => c.code === decision.code)!;
    s.aiProposal = { step: s.step, code: choice.code, label: choice.label, expiresAt: Date.now() + 300000 };
    return { session: s, text: `¿Te refieres a esto?\n${this.selectionLabel(s, choice)}\n\nEscribe ELEGIR si está bien, o dime otra opción. Al final revisamos y confirmas el pedido completo.` };
  }

  private async bundleQuote(s: Session): Promise<{ text: string; entries: QueuedProduct[]; signature?: string }> {
    s.catalog = await this.catalog();
    const resolved = resolveTextOrder(s.textOrder!, s.catalog);
    if (resolved.missing.length) {
      delete s.textOrder!.quote;
      return { text: `Tengo anotado: ${s.textOrder!.source}\n${resolved.missing.join("\n")}`, entries: [] };
    }
    const signature = JSON.stringify({ entries: resolved.entries, products: resolved.entries.map(e=>s.catalog.find(p=>p.id===e.productId)) });
    const lines = resolved.entries.map(e=>{
      const p=s.catalog.find(p=>p.id===e.productId)!;
      const base=p.variants?.length ? `desde ${money(Math.min(...p.variants.map(v=>v.price))*e.qty)}` : money((p.price+(e.modifiers??[]).reduce((sum,m)=>sum+m.price*m.qty,0))*e.qty);
      return `${e.qty} × ${p.name}${e.modifiers?.length?` (${e.modifiers.map(m=>m.option).join(", ")})`:""} — ${base}`;
    });
    return { text: "Lo puedo armar así:\n" + lines.join("\n") + "\n¿Está bien así? Responde SÍ para seguir; todavía falta confirmar el pedido completo.", entries: resolved.entries, signature };
  }

  private async bundlePrompt(s: Session): Promise<string> {
    if (s.textOrder?.unknownPhrase && /^orden(?:es)? de /.test(s.textOrder.unknownPhrase)) {
      s.step = "human"; delete s.confirmation; delete s.aiProposal;
      return "Ya tengo tu solicitud. El equipo sigue contigo por aquí para completar el pedido; no necesitas repetirlo.";
    }
    const quote=await this.bundleQuote(s);s.textOrder!.quote=quote.signature;return quote.text;
  }

  private pendingPrompt(s: Session): string {
    switch(s.step) {
      case "quantity": return `De ${s.selected!.name}, ¿cuántos te anoto?`;
      case "variant": return "Sólo falta elegir la presentación:\n" + s.selected!.variants!.map((v,i)=>`${i+1}. ${v.label} — ${money(v.price)}`).join("\n");
      case "catalog_recovery": return "¿Cuál es el nombre del paquete que elegiste? Con eso seguimos con tu pedido.";
      case "modifier": return modifierPrompt(s);
      case "menu": return "Dime qué te gustaría pedir.";
      case "more": return "¿Algo más? Escribe MÁS para agregar o LISTO para seguir.";
      case "address_confirm": return this.addressPrompt(s.candidate!);
      case "address_choice": return "¿Cuál de estas direcciones es la tuya?\n" + s.addressCandidates!.map((c,i)=>`${i+1}. ${c.address}`).join("\n") + "\nResponde con el número o escribe CORREGIR.";
      default: return checkoutPrompt(s);
    }
  }

  private async catalog() {
    const products = await this.app.prisma.product.findMany({
      where: { active: true, soldOut: false }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      include: { modifiers: { orderBy: { sortOrder: "asc" } } },
    });
    return products.map(p => productSchema.parse(p));
  }

  private restoreBasket(basket: RememberedBasket, catalog: Product[]): Item[] {
    return basket.map(saved => {
      const p = catalog.find(p => p.id === saved.productId);
      if (!p) throw new Error("Producto no disponible");
      const variant = p.variants?.find(v => v.label === saved.variant);
      if (p.variants?.length ? !variant : Boolean(saved.variant)) throw new Error("Presentación distinta");
      const mods = saved.modifiers.map(pick => {
        const def = p.modifiers.find(m => m.name === pick.name);
        const option = def?.options.find(o => o.label === pick.option);
        if (!def || !option) throw new Error("Opción distinta");
        return { ...pick, price: option.price };
      });
      for (const def of p.modifiers) {
        const picks = mods.filter(m => m.name === def.name);
        const count = picks.reduce((sum, m) => sum + m.qty, 0);
        if (count < (def.totalQuota ?? Math.max(def.minSelect, def.required ? 1 : 0)) || count > (def.totalQuota ?? def.maxSelect) ||
            new Set(picks.map(m => m.option)).size !== picks.length || (!def.totalQuota && picks.some(m => m.qty !== 1))) throw new Error("Opciones incompletas");
      }
      return { productId: p.id, name: p.name, qty: saved.qty, variant: saved.variant, unitPrice: variant?.price ?? p.price,
        modifiers: mods, configuration: JSON.stringify(p) };
    });
  }

  private async findAddress(s: Session, input: Incoming): Promise<string> {
    const query = input.text.trim();
    if (query.length < 8 || query.length > 500) return "Escribe calle, número, colonia y ciudad, o comparte tu ubicación.";
    const key = `wa:geocode:${input.phone}:${Math.floor(Date.now() / 600000)}`;
    const count = Number(await this.app.redis.get(key) || "0");
    if (count >= 5) return "No logré resolver la dirección. Comparte tu ubicación o escribe ASESOR para que el equipo te ayude.";
    await this.app.redis.set(key, String(count + 1), { EX: 660 });
    const candidates = await this.geocode(query).catch(() => []);
    if (!candidates.length) return "No encuentro el punto exacto. ¿Me agregas la colonia y ciudad? También puedes compartir tu ubicación o escribir ASESOR para que el equipo te ayude.";
    s.addressCandidates = candidates;
    if (candidates.length > 1) {
      s.step = "address_choice";
      return "Me aparecen estas direcciones. ¿Cuál es la tuya?\n" + candidates.map((c, i) => `${i + 1}. ${c.address}`).join("\n") + "\nResponde con el número o escribe CORREGIR.";
    }
    s.candidate = candidates[0]; s.step = "address_confirm";
    return this.addressPrompt(s.candidate);
  }

  private addressPrompt(candidate: AddressCandidate) {
    return `Me aparece esta dirección:\n${candidate.address}\n\n¿Es ahí? Escribe USAR DIRECCIÓN si está bien, o CORREGIR. También puedes compartir tu ubicación. Después reviso si tenemos entrega y cuánto cuesta.`;
  }

  private unavailable(s: Session | null, input: string, status: Awaited<ReturnType<typeof isAcceptingOrders>>): BotReply {
    const text = normalize(input);
    const pendingConfirmation = !!s && (s.step === "confirm" || !!s.closedPendingConfirmation);
    if (s) {
      delete s.confirmation; delete s.aiProposal;
      if (pendingConfirmation) s.closedPendingConfirmation = true;
    }
    if (status.closure === "paused") {
      const empathy = /\b(?:por favor|porfa|insisto|solo|nada mas|andale)\b/.test(text) ? "Entiendo que quieres pedir; disculpa la molestia.\n" : isGreeting(text) ? "¡Hola! Gracias por escribirnos.\n" : "";
      const pending = pendingConfirmation ? (/\b(?:antes|hace rato|empece|empezamos)\b/.test(text) ? "\nSí, ya habíamos empezado a armarlo, pero tu pedido todavía no quedó registrado. Si se reanuda la recepción, tendrás que revisar el resumen y confirmar nuevamente." : "\nTu pedido todavía no quedó registrado. Si se reanuda la recepción, tendrás que revisar el resumen y confirmar nuevamente.") : "";
      return { session: s, text: empathy + status.reason + pending };
    }
    if (pendingConfirmation && (status.closure === "cutoff" || status.closure === "hours")) {
      if (/\b(?:antes|hace rato|temprano|ya te|ya les)\b/.test(text)) {
        return { session: s, text: "Sí, empezamos a verlo antes, pero quedó pendiente la confirmación. Disculpa la molestia." };
      }
      if (/\b(?:por favor|porfa|insisto|excepcion|solo uno|nada mas|andale)\b/.test(text)) {
        return { session: s, text: "Disculpa, por hoy ya no podemos tomar otro pedido. El tuyo no quedó registrado." };
      }
      return { session: s, text: "Disculpa, ya dejamos de recibir pedidos por hoy. Tu pedido no quedó registrado." };
    }
    if (status.closure === "day" && /\b(?:recoger|paso|sucursal)\b/.test(text)) {
      return { session: s, text: "Hoy tampoco tenemos pedidos para recoger." };
    }
    if (status.closure === "day" && /\b(?:por favor|porfa|insisto|excepcion|solo uno|andale)\b/.test(text)) {
      return { session: s, text: "Disculpa, hoy no tenemos servicio y no podemos tomar pedidos." };
    }
    if (status.closure === "day" && status.reason === "El negocio está cerrado por hoy.") {
      return { session: s, text: "¡Hola! Hoy no tenemos servicio. Gracias por escribirnos 🍗" };
    }
    return { session: s, text: status.reason || "Por hoy ya no estamos recibiendo pedidos." };
  }

  private async summary(s: Session) {
    const availability = await isAcceptingOrders(this.app);
    if (!availability.accepting) {
      return this.unavailable(s, "", availability).text;
    }
    if (s.type === "DELIVERY" && !(await getStoreConfig(this.app)).deliveryActive) {
      delete s.confirmation; s.step = "delivery_details";
      return "Por ahora no tenemos entrega a domicilio. Conservé tu pedido; escribe RECOGER si puedes pasar por él o ASESOR para revisarlo con el equipo.";
    }
    if (s.type === "DELIVERY" && (!s.name || !s.address || !s.facade || !s.deliveryPhone || s.lat === undefined || s.lng === undefined || s.locationNeedsCheck)) return checkoutPrompt(s);
    if ((deliveryAddress(s)?.length ?? 0) > 500 || orderNotes(s).length > 500) {
      s.step = "human"; delete s.confirmation;
      return "Tus datos de entrega necesitan revisión del equipo para guardarlos completos. Conservé el pedido; todavía no está confirmado.";
    }
    // Revalidate choices and prices from DB, including modifiers. Never trust
    // the saved menu or any price supplied in a customer's message.
    const catalog = await this.catalog();
    for (const item of s.items) {
      const p = catalog.find(p => p.id === item.productId);
      if (!p || JSON.stringify(p) !== item.configuration) {
        s.step = "menu"; s.items = []; s.catalog = catalog;
        delete s.pending; delete s.selected; delete s.skipOptionalModifiers;
        return "El menú cambió o un producto se agotó. Selecciona de nuevo para confirmar opciones y precios actuales.\n\n" + menu(s);
      }
    }
    s.fee = 0;
    if (s.type === "DELIVERY") {
      const delivery = await new DeliveryService(this.app).calculate(s.lat!, s.lng!);
      if (!delivery.available) { s.step = "location"; return (delivery.reason || "Fuera de cobertura.") + " Envía otra ubicación o escribe RECOGER."; }
      s.fee = delivery.fee ?? 0;
    }
    s.total = s.items.reduce((sum, item) => sum + itemTotal(item), 0) + s.fee;
    if (s.cashAmount && s.cashAmount < s.total) { s.step = "cash"; return `El total es ${money(s.total)}. ¿Con cuánto pagarás? Escribe el monto en pesos o EXACTO.`; }
    s.step = "confirm";
    s.confirmation = { code: crypto.randomBytes(3).toString("hex").toUpperCase(), expiresAt: Date.now() + 600000 };
    return "Así va tu pedido:\n" + s.items.map(i =>
      `${i.qty} × ${i.name}${i.variant ? " (" + i.variant + ")" : ""} — ${money(itemTotal(i))}` +
      i.modifiers.map(m => `\n  ${m.name}: ${m.qty} × ${m.option}`).join("")
    ).join("\n") + `\nNombre: ${s.name}\n${s.type === "DELIVERY" ? "Entrega: " + deliveryAddress(s) + "\nTeléfono para entrega: " + s.deliveryPhone + "\nEnvío: " + money(s.fee) : "Recoger en sucursal"}` +
      (s.type === "PICKUP" && s.pickupRequest ? `\nSolicitud del cliente: ${s.pickupRequest}. Hora de preparación no confirmada.` : "") +
      (s.notes ? `\nNotas: ${s.notes}` : "") + `\nPago en efectivo${s.cashAmount ? " con " + money(s.cashAmount) : " exacto"}\n*Total: ${money(s.total)}*` +
      "\n\nPulsa Confirmar pedido. Si no aparecen botones, mantén presionado ESTE resumen, elige Responder y escribe CONFIRMAR. El resumen vence en 10 minutos." + help;
  }

  async advance(s: Session | null, input: Incoming): Promise<BotReply> {
    const text = normalize(input.text);
    const respond = (text: string, handoff = false) => ({ session: s, text, handoff });
    if (isExcludedContact(input.phone)) return respond("");
    if (input.fromMe) {
      if (text === "pausar bot") {
        s ??= { step: "human", checkoutId: crypto.randomUUID(), catalog: [], items: [] };
        s.step = "human"; delete s.confirmation; delete s.aiProposal; return respond("");
      }
      if (text === "activar bot") return { session: null, text: "El asistente está disponible. Escribe PEDIR para iniciar." };
      return respond("");
    }
    if (s?.step === "confirm") {
      const committed = await this.app.prisma.order.findUnique({ where: { whatsappCheckoutId: s.checkoutId } });
      if (committed) { s.step = "done"; s.orderNumber = committed.orderNumber; }
    }
    if (s?.step === "human") return respond("");
    const topic = manualTopic(input.text);
    if (topic) {
      s ??= { step: "human", checkoutId: crypto.randomUUID(), catalog: [], items: [] };
      s.step = "human"; delete s.confirmation; delete s.aiProposal;
      return respond(manualTopicReply(topic), true);
    }
    const policyReply = requestPolicyReply(input.text);
    if (policyReply) { if (s) delete s.aiProposal; return respond(policyReply); }
    if (asksIdentity(text)) return respond("Soy el asistente virtual de pedidos de Pollón. Escribe ASESOR para hablar con alguien del equipo, o continúa con tu pedido.");
    if (text === "asesor" || text === "ayuda" || text === "persona" || requestsHuman(text) || needsHumanReview(text) || requestsOrderChange(text)) {
      s ??= { step: "human", checkoutId: crypto.randomUUID(), catalog: [], items: [] };
      s.step = "human"; delete s.confirmation; delete s.aiProposal;
      return respond((needsHumanReview(text) ? "Las alergias y requisitos de preparación necesitan revisión del equipo; no puedo garantizar que un producto sea adecuado. " : requestsOrderChange(text) ? "No he aplicado ese cambio ni confirmado un nuevo pedido. El equipo debe revisar los datos contigo. " : "") + "El equipo puede atender este tema contigo por aquí.", true);
    }
    if (input.hasImage) {
      if (!s && !/\b(?:pedir|pedido|promocion|promo|menu|catalogo|producto|precio|cuesta|papas|pollo|hamburguesa|hot.?dog)\b/.test(text)) {
        return respond("¿Qué necesitas revisar de la imagen? Cuéntamelo en un mensaje de texto para ayudarte.");
      }
      if ((s && !["menu", "more"].includes(s.step)) || s?.imageRequest) {
        s ??= { step: "human", checkoutId: crypto.randomUUID(), catalog: [], items: [] };
        s.step = "human"; delete s.confirmation; delete s.aiProposal; delete s.imageRequest;
        return respond("Para no anotar algo distinto, el equipo necesita revisar la imagen contigo por aquí.", true);
      }
      s ??= { step: "menu", checkoutId: crypto.randomUUID(), catalog: await this.catalog(), items: [] };
      s.step = "menu";
      s.imageRequest = { caption: input.text.slice(0, 1000) };
      delete s.aiProposal;
      const availability = await isAcceptingOrders(this.app);
      return respond((availability.accepting ? "" : availability.reason + "\n\n") +
        "¿Qué producto de la imagen quieres y cuántos? Escríbeme el nombre para revisar el precio actual y si hay alguna promoción vigente.");
    }
    if (s?.imageRequest && isDeliveryReference(input.text)) {
      s.deliveryReference = input.text.trim().slice(0, 350);
      return respond("Tengo esa referencia de entrega pendiente de confirmar. ¿Qué producto de la imagen quieres y cuántos? Después revisamos la ubicación y el costo de envío.");
    }
    if (s?.imageRequest && repeatsImageReference(input.text)) {
      s.step = "human"; delete s.confirmation; delete s.aiProposal; delete s.imageRequest;
      return respond("Para no anotar algo distinto, el equipo necesita revisar la imagen contigo por aquí.", true);
    }
    if (browsesMenu(text)) {
      const products = await this.catalog();
      const availability = await isAcceptingOrders(this.app);
      if (availability.accepting && !s) {
        s = { step: "menu", checkoutId: crypto.randomUUID(), catalog: products, items: [] };
        return respond(menu(s));
      }
      if (availability.accepting && s?.step === "menu") { s.catalog = products; delete s.aiProposal; return respond(menu(s)); }
      const list = products.map(p => `${p.name} — ${p.variants?.length ? "desde " + money(Math.min(...p.variants.map(v => v.price))) : money(p.price)}`).join("\n");
      return respond("¡Claro! Puedes consultar el menú aquí:\n" + catalogUrl() +
        (list ? "\n\n" + list : "") +
        (!availability.accepting ? "\n\n" + (availability.closure === "paused" ? availability.reason : "Por ahora no estamos recibiendo pedidos, pero sí puedes ver las opciones.") : "") +
        "\nLos precios y la disponibilidad se revisan cuando hagas tu pedido.");
    }
    if (input.unsupportedMedia) return respond("¿Me lo escribes en un mensaje de texto? Por ahora no puedo revisar audios, fotos ni archivos. También puedes compartir tu ubicación o escribir ASESOR para que te ayude el equipo.");
    const memory = new WhatsAppMemory(this.app);
    if (text === "borrar preferencias") {
      await memory.forget(input.phone);
      if (s) { delete s.pendingMemory; delete s.reuseItems; if (s.step === "reuse") s.step = "menu"; }
      return respond("Borré tus preferencias y tu pedido habitual guardado. Los pedidos ya realizados permanecen en el historial del negocio.");
    }
    if (text === "mis preferencias") {
      const stored = await memory.read(input.phone);
      return respond(stored ? `Preferencia: ${stored.note || "Ninguna"}\nPedido habitual: ${stored.basket ? stored.basket.length + " productos" : "Ninguno"}.\nPuedes escribir PREFERENCIA: seguida de tu nueva preferencia, REPETIR PEDIDO o BORRAR PREFERENCIAS.` : "No tienes preferencias guardadas. Puedes escribir PREFERENCIA: seguida de lo que quieres recordar.");
    }
    if (text.startsWith("preferencia:")) {
      const note = input.text.slice(input.text.indexOf(":") + 1).trim();
      if (!note || note.length > 350) return respond("Escribe una preferencia de 1 a 350 caracteres.");
      s ??= { step: "menu", checkoutId: crypto.randomUUID(), catalog: await this.catalog(), items: [] };
      s.pendingMemory = { note, expiresAt: Date.now() + 600000 };
      return respond(`¿Quieres que recuerde esta preferencia durante 180 días?\n${note}\nEscribe GUARDAR para autorizar. No se aplicará automáticamente ni cambia precios o reglas. Puedes borrarla con BORRAR PREFERENCIAS.`);
    }
    if (text === "recordar pedido") {
      if (!s || s.step !== "done" || !s.items.length) return respond("Primero completa un pedido. Después puedes escribir RECORDAR PEDIDO.");
      s.pendingMemory = { basket: s.items.map(i => ({ productId: i.productId, qty: i.qty, variant: i.variant, modifiers: i.modifiers.map(m => ({ name: m.name, option: m.option, qty: m.qty })) })), expiresAt: Date.now() + 600000 };
      return respond("¿Guardo los productos, cantidades y opciones de este pedido como tu habitual por 180 días? No guardaré dirección ni datos de pago. Escribe GUARDAR para autorizar; podrás borrarlo con BORRAR PREFERENCIAS.");
    }
    if (text === "guardar") {
      if (!s?.pendingMemory || s.pendingMemory.expiresAt <= Date.now()) return respond("No hay una preferencia pendiente de autorización. Escribe PREFERENCIA: o RECORDAR PEDIDO.");
      await memory.save(input.phone, s.pendingMemory); delete s.pendingMemory;
      return respond("Guardado con tu autorización. Puedes consultar MIS PREFERENCIAS o BORRAR PREFERENCIAS. Nunca se usará para confirmar una compra automáticamente.");
    }
    if (["lo de siempre", "repetir pedido"].includes(text)) {
      if (s && s.step !== "done" && (s.items.length || s.pending)) return respond("Ya tienes un borrador. Escribe CANCELAR antes de repetir tu pedido habitual.");
      const stored = await memory.read(input.phone);
      if (!stored?.basket) return respond("Todavía no tengo un pedido habitual autorizado. Escribe PEDIR para empezar.");
      const open = await isAcceptingOrders(this.app);
      if (!open.accepting) return this.unavailable(s, input.text, open);
      const catalog = await this.catalog();
      try {
        const items = this.restoreBasket(stored.basket, catalog);
        s = { step: "reuse", checkoutId: crypto.randomUUID(), catalog, items: [], reuseItems: items };
        return respond("Tu pedido habitual a precios actuales:\n" + items.map(i => `${i.qty} × ${i.name}${i.variant ? " (" + i.variant + ")" : ""} — ${money(itemTotal(i))}` + i.modifiers.map(m => `\n  ${m.name}: ${m.qty} × ${m.option}`).join("")).join("\n") + "\nEscribe USAR PEDIDO para armar el borrador. Después confirmaremos entrega, pago y total; no reutilizo direcciones.");
      } catch { return respond("Algún producto u opción de tu habitual ya no está disponible. Escribe PEDIR para elegir del menú actual; no sustituí nada."); }
    }
    if (text === "cancelar") {
      if (s?.step === "done") return respond("Tu pedido ya fue registrado. Escribe ASESOR para solicitar su cancelación.");
      return { session: null, text: "Listo, dejé de armar ese pedido. Escribe PEDIR si quieres empezar otro." };
    }
    if (s && s.step !== "done") {
      const availability = await isAcceptingOrders(this.app);
      if (!availability.accepting) {
        return this.unavailable(s, input.text, availability);
      }
    }
    if (s && !["human", "done", "reuse"].includes(s.step) && pickupRequest(input.text)) {
      s.type = "PICKUP"; s.pickupRequest = input.text.trim();
      delete s.confirmation; delete s.aiProposal; delete s.candidate; delete s.addressCandidates;
      if (["address_choice", "address_confirm"].includes(s.step)) s.step = "name";
      return respond("Lo anoté para recoger. El tiempo de preparación todavía no está confirmado.\n" + (s.step === "bundle" ? await this.bundlePrompt(s) : this.pendingPrompt(s)));
    }
    // A native location can arrive before product options, name or delivery type.
    // Retain the draft and validate the point with the same coverage/pricing service.
    if (input.location && s && !["human", "done", "reuse"].includes(s.step)) {
      if (s.lat === input.location.lat && s.lng === input.location.lng && !s.locationNeedsCheck) return respond("");
      if (!(await getStoreConfig(this.app)).deliveryActive) return respond("Por ahora no tenemos entrega a domicilio. Conservé tu pedido; puedes seguir para recoger o escribir ASESOR.");
      const delivery = await new DeliveryService(this.app).calculate(input.location.lat, input.location.lng);
      if (!delivery.available) {
        delete s.lat; delete s.lng; delete s.fee; delete s.confirmation;
        if (["notes", "payment", "cash", "confirm", "address_confirm", "address_choice"].includes(s.step)) s.step = "location";
        return respond((delivery.reason || "Esa ubicación queda fuera de cobertura.") + " Conservé tu pedido. Puedes compartir otra ubicación.");
      }
      s.type = "DELIVERY"; s.lat = input.location.lat; s.lng = input.location.lng; s.fee = delivery.fee ?? 0;
      delete s.locationNeedsCheck;
      delete s.candidate; delete s.addressCandidates; delete s.confirmation; delete s.aiProposal;
      return respond(`Ya tengo tu ubicación. El envío cuesta ${money(s.fee)}.\n` + (s.step === "bundle" ? await this.bundlePrompt(s) : this.pendingPrompt(s)));
    }
    // Delivery details often arrive in separate messages, before the question
    // for that particular field. Keep them apart from product choices and notes.
    if (s && s.type !== "PICKUP" && !["human", "done", "reuse"].includes(s.step)) {
      const details = incomingDetails(input, s.step);
      if (details) {
        if (details.error) return respond(details.error);
        if ((!details.name || details.name === s.name) && (!details.phone || details.phone === s.deliveryPhone) &&
            (!details.address || details.address === s.address) && (!details.facade || details.facade === s.facade)) return respond("");
        if ((details.address || details.facade) && !(await getStoreConfig(this.app)).deliveryActive) return respond("Por ahora no tenemos entrega a domicilio. Conservé tu pedido; puedes seguir para recoger o escribir ASESOR.");
        // Preserve Google address selection when the customer explicitly chose
        // written-address checkout and has not shared a native point yet.
        if (details.address && ["location", "address_choice", "address_confirm"].includes(s.step) && s.lat === undefined && !details.phone && !details.name) {
          if (s.address !== details.address) delete s.facade;
          s.address = details.address;
          delete s.candidate; delete s.addressCandidates; s.step = "location";
          if (details.facade) s.facade = details.facade;
          return respond(await this.findAddress(s, input));
        }
        const proposed = { ...s, ...details, ...(details.phone ? { deliveryPhone: details.phone } : {}) };
        if ((deliveryAddress(proposed)?.length ?? 0) > 500) return respond("¿Me mandas la dirección y la referencia juntas en máximo 500 caracteres? Conservé los datos anteriores.");
        if (orderNotes(proposed).length > 500) return respond("Las indicaciones y los datos de entrega son demasiado largos para guardarlos completos. Escribe ASESOR para revisarlos con el equipo; conservé el pedido.");
        if (details.name) s.name = details.name;
        if (details.phone) s.deliveryPhone = details.phone;
        if (details.address) {
          if (s.address && normalize(s.address) !== normalize(details.address)) {
            if (s.lat !== undefined && s.lng !== undefined) s.locationNeedsCheck = true;
            else delete s.facade;
          }
          s.address = details.address; s.type = "DELIVERY";
          if (["address_choice", "address_confirm"].includes(s.step)) {
            delete s.candidate; delete s.addressCandidates; s.step = "location";
          }
        }
        if (details.facade) { s.facade = details.facade; s.type = "DELIVERY"; }
        delete s.confirmation; delete s.aiProposal;
        const acknowledgement = details.phone ? "Ya tengo el teléfono para la entrega." : details.address ? "Ya tengo la dirección escrita." : details.facade ? "Anoté la referencia de tu fachada." : "Gracias.";
        return respond(acknowledgement + "\n" + (s.step === "bundle" ? await this.bundlePrompt(s) : this.pendingPrompt(s)));
      }
    }
    if (s?.step === "catalog_recovery") {
      const catalog = await this.catalog();
      const entry = exactCatalogRequest(input.text, catalog);
      if (entry) {
        s.catalog = catalog; s.queuedProducts = [entry];
        delete s.pendingCatalogRequest; delete s.catalogRecoveryAttempts;
        return respond("Anoté " + entry.qty + " × " + catalog.find(p => p.id === entry.productId)!.name + ". " + beginQueuedProduct(s));
      }
      s.catalogRecoveryAttempts = (s.catalogRecoveryAttempts ?? 0) + 1;
      if (s.catalogRecoveryAttempts > 1) {
        s.step = "human";
        return respond("El equipo sigue contigo por aquí para revisar el artículo que elegiste.", true);
      }
      return respond("Podemos seguir por aquí. Sólo necesito el nombre del paquete que elegiste; lo demás te lo voy pidiendo conforme haga falta.");
    }
    if (s?.step === "bundle" && s.textOrder) {
      const previousQuote=s.textOrder.quote;
      const corrected=correctUnknownLine(s.textOrder,input.text,await this.catalog());
      if(corrected){s.textOrder=corrected;return respond(await this.bundlePrompt(s));}
      if (applySideSizes(s.textOrder, input.text)) return respond(await this.bundlePrompt(s));
      if (/^(?:si|si claro|asi esta bien|esta bien|correcto|de acuerdo)[.! ]*$/.test(text) && previousQuote) {
        const quote=await this.bundleQuote(s);
        if (quote.signature !== previousQuote) { s.textOrder.quote=quote.signature; return respond("Cambió la disponibilidad o el precio. Revisa cómo queda:\n" + quote.text); }
        if (s.items.length+quote.entries.length>30) return respond("Este pedido necesita que lo revise el equipo. Escribe ASESOR; conservé los datos que mandaste.");
        s.queuedProducts=quote.entries.map(e=>({...e,skipOptional:true}));s.batchOrder=true;
        s.lastTextOrder=s.textOrder.source;
        delete s.textOrder;delete s.confirmation;delete s.aiProposal;
        return respond(beginQueuedProduct(s));
      }
      return respond(await this.bundlePrompt(s));
    }
    if (s?.lastTextOrder && normalize(s.lastTextOrder)===text && ["name", "quantity", "variant", "modifier"].includes(s.step)) {
      return respond("Ya tengo esos productos anotados. " + this.pendingPrompt(s));
    }
    if ((!s || ["menu", "more"].includes(s.step)) && isTextOrderCandidate(input.text)) {
      const open=await isAcceptingOrders(this.app);if(!open.accepting)return this.unavailable(s,input.text,open);
      const catalog=await this.catalog();const draft=exactCatalogRequest(input.text,catalog) ? null : parseTextOrder(input.text,catalog);
      if(draft){
        s ??= {step:"bundle",checkoutId:crypto.randomUUID(),catalog,items:[]};
        s.step="bundle";s.catalog=catalog;s.textOrder=draft;delete s.aiProposal;delete s.confirmation;
        return respond(await this.bundlePrompt(s));
      }
    }
    if ((!s || ["menu", "more", "modifier", "variant"].includes(s.step)) && !input.catalogSelection && !input.location) {
      const catalog = await this.catalog();
      const entry = exactCatalogRequest(input.text, catalog);
      if (entry) {
        const open = await isAcceptingOrders(this.app);
        if (!open.accepting) return this.unavailable(s, input.text, open);
        s ??= { step: "menu", checkoutId: crypto.randomUUID(), catalog, items: [] };
        if (s.pending?.productId === entry.productId && s.pending.qty === entry.qty &&
            (!entry.variant || entry.variant === s.pending.variant) && !/^(?:y |ademas |agrega |agregame )/.test(text)) {
          return respond("Ya tengo ese producto. " + this.pendingPrompt(s));
        }
        if (s.items.length + (s.pending ? 1 : 0) + (s.queuedProducts?.length ?? 0) >= 30)
          return respond("Conservé tu pedido. Para agregar más productos necesitamos que lo revise el equipo.");
        const existingQuantity = [...s.items, ...(s.pending ? [s.pending] : []), ...(s.queuedProducts ?? [])]
          .filter(item => item.productId === entry.productId).reduce((total, item) => total + item.qty, 0);
        if (existingQuantity + entry.qty > 20)
          return respond("Conservé tu pedido. Esa cantidad supera el límite por producto; necesitamos que la revise el equipo.");
        s.catalog = catalog;
        s.queuedProducts ??= [];
        s.queuedProducts.push(entry);
        delete s.confirmation; delete s.aiProposal;
        if (s.pending) {
          const next = s.step === "modifier"
            ? `¿Qué ${s.selected!.modifiers[s.modifierIndex!].name.toLowerCase()} prefieres para ${s.selected!.name}?`
            : this.pendingPrompt(s);
          return respond(`Anoté ${entry.qty} × ${catalog.find(p => p.id === entry.productId)!.name}. ` + next);
        }
        return respond(beginQueuedProduct(s));
      }
    }
    if (text === "usar preferencia") {
      if (s?.step !== "notes") return respond("Puedes usar tu preferencia cuando te pregunte por las indicaciones del pedido.");
      const stored = await memory.read(input.phone);
      if (!stored?.note) return respond("No tienes una preferencia guardada. Escribe tus indicaciones o SIN NOTAS.");
      s.notes = stored.note; s.step = "payment";
      return respond(`Aplicaré esta indicación al borrador: ${stored.note}\nLa verás nuevamente en el resumen. Escribe EFECTIVO para continuar o ASESOR para otra forma de pago.`);
    }
    if (input.catalogSelection) {
      if (s && s.step !== "done" && !["menu", "more"].includes(s.step)) return respond("Termina el producto actual o escribe CANCELAR antes de enviar otro carrito del catálogo.");
      const open = await isAcceptingOrders(this.app);
      if (!open.accepting) return this.unavailable(s, input.text, open);
      const catalog = await this.catalog();
      try {
        const entries = await resolveCatalog(this.app, input.catalogSelection);
        for (const entry of entries) {
          const product = catalog.find(p => p.id === entry.productId);
          if (!product || (entry.variant && !product.variants?.some(v => v.label === entry.variant))) throw new Error("Producto no disponible");
        }
        if ((s?.step === "done" ? 0 : s?.items.length ?? 0) + entries.length > 30) throw new Error("Demasiados productos");
        if (!s || s.step === "done") s = { step: "menu", checkoutId: crypto.randomUUID(), catalog, items: [] };
        s.catalog = catalog; s.queuedProducts = entries; delete s.confirmation;
        if (input.catalogSelection.singleProduct) {
          const entry = s.queuedProducts.shift()!;
          s.catalogVariant = entry.variant;
          s.selected = catalog.find(p => p.id === entry.productId)!; s.step = "quantity";
          return respond(`Elegiste ${s.selected.name}${entry.variant ? ` (${entry.variant})` : ""} del catálogo. ¿Cuántos quieres? Responde con una cantidad del 1 al 20.`);
        }
        return respond("Ya tengo tu selección del catálogo. Vamos a revisar las opciones y el precio antes de confirmar.\n\n" + beginQueuedProduct(s));
      } catch {
        s ??= { step: "human", checkoutId: crypto.randomUUID(), catalog, items: [] };
        s.pendingCatalogRequest = { messageId: input.id, sellerJid: input.catalogSelection.sellerJid, orderId: input.catalogSelection.orderId, lines: input.catalogSelection.lines };
        if (input.catalogSelection.itemCount === 1 &&
            /^\d{11,15}@s\.whatsapp\.net$/.test(input.catalogSelection.sellerJid) &&
            normalizarTelefono(input.catalogSelection.sellerJid.split("@")[0]) === normalizarTelefono(process.env.WHATSAPP_CATALOG_PHONE || "5214428219534") &&
            !s.items.length && !s.pending) {
          s.step = "catalog_recovery"; s.catalogRecoveryAttempts = 0;
          delete s.confirmation; delete s.aiProposal;
          return respond("Recibí tu solicitud, pero no pude leer el artículo seleccionado. ¿Cuál es el nombre del paquete? Con eso seguimos por aquí.");
        }
        s.step = "human"; delete s.confirmation; delete s.aiProposal;
        return respond("Recibí tu solicitud del catálogo. El equipo sigue contigo por aquí para revisar ese pedido; no necesitas enviarlo de nuevo.", true);
      }
    }
    if (!s || (s.step === "done" && ["pedir", "nuevo", "menu"].includes(text))) {
      if (!text || /^\d{4,8}$/.test(text)) return respond(""); // OTP replies aren't new orders.
      const open = await isAcceptingOrders(this.app);
      if (!open.accepting) return this.unavailable(s, input.text, open);
      const catalog = await this.catalog();
      if (!catalog.length) return respond("No hay productos disponibles en este momento. Escribe ASESOR para atención personal.");
      s = { step: "menu", checkoutId: crypto.randomUUID(), catalog, items: [] };
      if (isGreeting(text)) return respond("¡Hola! 🍗 ¿Qué te gustaría pedir? Si quieres ver las opciones, escribe MENÚ.");
      return respond(menu(s));
    }
    if (s.step === "done") return respond(`Tu pedido #${s.orderNumber} ya está registrado. Escribe PEDIR para uno nuevo, RECORDAR PEDIDO para guardarlo como habitual o ASESOR.`);
    if (text === "recoger" && ["location", "location_check", "address", "address_choice", "address_confirm", "delivery_details"].includes(s.step)) { s.type = "PICKUP"; s.step = "notes"; delete s.candidate; delete s.locationNeedsCheck; return respond("¿Alguna indicación para tu pedido? Escribe SIN NOTAS si no tienes, o USAR PREFERENCIA si ya guardaste una."); }
    if (input.location && ["address_choice", "address_confirm"].includes(s.step)) { s.step = "location"; delete s.candidate; }
    switch (s.step) {
      case "reuse":
        if (text !== "usar pedido") return respond("Escribe USAR PEDIDO para continuar con ese borrador o CANCELAR.");
        s.items = s.reuseItems!; delete s.reuseItems; s.step = "name";
        return respond("¿A qué nombre lo ponemos?");
      case "menu": {
        const index = parseSelection(text, s.catalog.length);
        if (index === null) return respond(menu(s));
        if (s.items.length >= 30) return respond("Llegaste al máximo de productos. Escribe ASESOR para completar tu pedido.");
        delete s.imageRequest;
        s.selected = s.catalog[index]; s.step = "quantity";
        return respond(`De ${s.selected.name}, ¿cuántos te anoto? Puedes pedir de 1 a 20.`);
      }
      case "quantity": {
        const qty = parseSelection(text, 20);
        if (qty === null) return respond("Escribe una cantidad del 1 al 20.");
        const p = s.selected!;
        const fixedVariant = p.variants?.find(v => v.label === s.catalogVariant);
        delete s.catalogVariant;
        s.pending = { productId: p.id, name: p.name, qty: qty + 1, unitPrice: fixedVariant?.price ?? p.price,
          ...(fixedVariant ? { variant: fixedVariant.label } : {}), modifiers: [], configuration: JSON.stringify(p) };
        s.modifierIndex = 0;
        if (p.variants?.length && !fixedVariant) {
          s.step = "variant";
          return respond("Elige la presentación:\n" + p.variants.map((v, i) => `${i + 1}. ${v.label} — ${money(v.price)}`).join("\n"));
        }
        return respond(nextModifier(s));
      }
      case "variant": {
        const index = parseSelection(text, s.selected!.variants!.length);
        if (index === null) return respond("Responde con el número de la presentación.");
        const variant = s.selected!.variants![index]; s.pending!.variant = variant.label; s.pending!.unitPrice = variant.price;
        return respond(nextModifier(s));
      }
      case "modifier": {
        const selected = selectModifiers(text, s.selected!.modifiers[s.modifierIndex!]);
        if (!selected) return respond("Revisa tu selección.\n" + modifierPrompt(s));
        s.pending!.modifiers.push(...selected); s.modifierIndex!++;
        return respond(nextModifier(s));
      }
      case "more":
        if (["mas", "menu"].includes(text)) { s.step = "menu"; return respond(menu(s)); }
        if (text !== "listo") return respond("¿Algo más? Escribe MÁS para agregar o LISTO para seguir.");
        return respond(checkoutPrompt(s));
      case "name":
        if (!validRecipient(input.text.trim())) return respond("¿A qué nombre lo ponemos? La dirección y el teléfono los guardo por separado.");
        s.name = input.text.trim(); return respond(checkoutPrompt(s));
      case "type":
        if (!["1", "2", "recoger", "domicilio"].includes(text)) return respond("Responde 1 para recoger o 2 para domicilio.");
        if (["2", "domicilio"].includes(text)) {
          if (!(await getStoreConfig(this.app)).deliveryActive) return respond("El envío a domicilio no está disponible. Responde 1 para recoger o ASESOR.");
          s.type = "DELIVERY"; s.step = "location";
          return respond((s.deliveryReference ? `Compartiste esta referencia: ${s.deliveryReference}\n` : "") + "¿Me confirmas calle, número, colonia y ciudad? También puedes compartir tu ubicación por WhatsApp. Primero revisamos que sea el lugar correcto.");
        }
        s.type = "PICKUP"; s.step = "notes"; return respond("¿Cómo te lo preparamos? Déjame tus indicaciones o escribe SIN NOTAS.");
      case "location": {
        if (!input.location) return respond(await this.findAddress(s, input));
        const delivery = await new DeliveryService(this.app).calculate(input.location.lat, input.location.lng);
        if (!delivery.available) return respond((delivery.reason || "Fuera de cobertura.") + " Envía otra ubicación o escribe RECOGER.");
        s.lat = input.location.lat; s.lng = input.location.lng; s.fee = delivery.fee ?? 0; s.step = "address";
        return respond(`El envío cuesta ${money(s.fee)}. Escribe calle, número, colonia y referencias de entrega.`);
      }
      case "address_choice": {
        if (text === "corregir") { s.step = "location"; return respond("Escribe la dirección completa o comparte la ubicación."); }
        const index = parseSelection(text, s.addressCandidates?.length ?? 0);
        if (index === null) return respond("Elige el número de una dirección o escribe CORREGIR.");
        s.candidate = s.addressCandidates![index]; s.step = "address_confirm";
        return respond(this.addressPrompt(s.candidate));
      }
      case "address_confirm": {
        if (text === "corregir") { s.step = "location"; delete s.candidate; return respond("Escribe la dirección completa o comparte la ubicación."); }
        if (text !== "usar direccion") return respond(this.addressPrompt(s.candidate!));
        const candidate = s.candidate!;
        const delivery = await new DeliveryService(this.app).calculate(candidate.lat, candidate.lng);
        if (!delivery.available) { s.step = "location"; delete s.candidate; return respond((delivery.reason || "Fuera de cobertura.") + " Escribe otra dirección o RECOGER."); }
        s.lat = candidate.lat; s.lng = candidate.lng; s.address ??= candidate.address; s.fee = delivery.fee ?? 0;
        delete s.candidate; delete s.addressCandidates;
        return respond(`Dirección confirmada. Envío: ${money(s.fee)}.\n` + checkoutPrompt(s));
      }
      case "address":
        return respond("¿Me escribes la calle y el número, además de una referencia de tu fachada?");
      case "location_check":
        if (/^(?:si|si claro|es la misma|la misma|correcto)[.! ]*$/.test(text)) { delete s.locationNeedsCheck; return respond(checkoutPrompt(s)); }
        if (/^(?:no|es otra|otra)[.! ]*$/.test(text)) { delete s.locationNeedsCheck; delete s.lat; delete s.lng; delete s.fee; if (!hasFacade(s.address || "")) delete s.facade; return respond(checkoutPrompt(s)); }
        return respond("Sólo confírmame si la ubicación anterior es la misma: SÍ o NO.");
      case "delivery_details":
        return respond(checkoutPrompt(s));
      case "notes":
        if (!text || input.text.length > 350 || orderNotes({ ...s, notes: input.text.trim() }).length > 500) return respond(`Escribe tus indicaciones (máximo ${Math.min(350, 498 - orderNotes({ ...s, notes: "" }).length)} caracteres) o SIN NOTAS.`);
        s.notes = text === "sin notas" ? "" : input.text.trim(); s.step = "payment";
        return respond("¿Pagas en efectivo? Escribe EFECTIVO para seguir. Si prefieres otro medio de pago, escribe ASESOR y lo revisas con el equipo.");
      case "payment":
        if (text !== "efectivo") return respond("Escribe EFECTIVO para continuar o ASESOR para otra forma de pago.");
        s.step = "cash"; return respond("¿Con cuánto vas a pagar? Dime el monto en pesos, por ejemplo 500, o escribe EXACTO.");
      case "cash":
        if (text === "exacto") delete s.cashAmount;
        else {
          if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(text) || Number(text) <= 0) return respond("Escribe un monto válido en pesos, como 500 o 500.50, o EXACTO.");
          s.cashAmount = Math.round(Number(text) * 100);
        }
        return respond(await this.summary(s));
      case "confirm": {
        if (!s.confirmation || s.confirmation.expiresAt <= Date.now()) {
          return respond("El resumen venció. Revisa los datos actualizados antes de confirmar.\n\n" + await this.summary(s));
        }
        const expectedButton = `wa_confirm:${s.checkoutId}:${s.confirmation.code}`;
        let confirmed = input.buttonId === expectedButton;
        if (!confirmed && text === "confirmar" && input.replyTo) {
          const delivered = await this.app.redis.get(`wa:summary:${input.phone}:${s.checkoutId}:${s.confirmation.code}`);
          confirmed = delivered === input.replyTo;
        }
        if (!confirmed) {
          return respond("Sólo falta confirmarlo: pulsa Confirmar pedido en el último resumen o responde a ese mensaje con CONFIRMAR. Si quieres dejarlo, escribe CANCELAR; para pedir ayuda, ASESOR.");
        }
        // Recover a previous commit even if the process died before saving the
        // session/response. The unique DB key is the final duplicate barrier.
        let existing = await this.app.prisma.order.findUnique({ where: { whatsappCheckoutId: s.checkoutId } });
        if (!existing) {
          const oldTotal = s.total;
          const summary = await this.summary(s);
          if (s.step !== "confirm" || !s.confirmation || oldTotal !== s.total) return respond(summary);
          const customer = await this.app.prisma.customer.upsert({ where: { phone: input.phone }, update: {}, create: { phone: input.phone, name: s.name } });
          const data = createOrderSchema.parse({
            type: s.type, paymentMethod: "CASH", cashAmount: s.cashAmount,
            address: deliveryAddress(s), deliveryAddress: deliveryAddress(s), deliveryLat: s.lat, deliveryLng: s.lng,
            notes: orderNotes(s),
            items: s.items.map(i => ({ productId: i.productId, qty: i.qty, variant: i.variant, modifiers: i.modifiers })),
          });
          try {
            if (await settledAttentionState(this.app.redis, input.phone) !== "automatic") return respond("");
            await new OrdersService(this.app).create(customer.id, data, { checkoutId: s.checkoutId, expectedTotal: s.total! });
          } catch (error) {
            existing = await this.app.prisma.order.findUnique({ where: { whatsappCheckoutId: s.checkoutId } });
            if (!existing) {
              this.app.log.warn({ err: error }, "WhatsApp checkout failed");
              // Unknown commit outcome: keep the checkout ID and retry only
              // after explicit confirmation; unique constraint prevents dupes.
              return respond("No pudimos confirmar el pedido. Puede haber cambiado la disponibilidad o el horario. Revisa nuevamente antes de reintentar o escribe ASESOR.\n\n" + await this.summary(s));
            }
          }
          existing ??= await this.app.prisma.order.findUnique({ where: { whatsappCheckoutId: s.checkoutId } });
        }
        if (!existing) throw new Error("WhatsApp order commit could not be verified");
        s.step = "done"; s.orderNumber = existing.orderNumber;
        return respond(`¡Listo! ✅ Tu pedido #${existing.orderNumber} quedó registrado. Total: ${money(existing.total)}. Pago en efectivo.\nTe avisaremos por aquí cuando cambie de estado. Escribe ASESOR para hablar con el equipo o RECORDAR PEDIDO si quieres guardarlo como habitual.`);
      }
    }
    return respond("Escribe ASESOR para recibir ayuda.");
  }

  async handle(input: Incoming) {
    if (isExcludedContact(input.phone)) return;
    const prefix = `wa:bot:${input.phone}`;
    const sessionKey = `${prefix}:session`;
    const seen = `${prefix}:message:${input.id}`;
    const lock = `${prefix}:lock`;
    const token = crypto.randomUUID();
    if (!await this.app.redis.set(lock, token, { NX: true, EX: 120 })) throw new Error("WhatsApp conversation busy; retry webhook");
    try {
      if (await this.app.redis.get(seen)) return;
      const blocked = async () => {
        if (input.fromMe) return false;
        const state = await settledAttentionState(this.app.redis, input.phone);
        if (state === "human") { await this.app.redis.set(seen, "1", { EX: 604800 }); return true; }
        return false;
      };
      if (await blocked()) return;
      const replyGeneration = await generation(this.app.redis, input.phone) + (input.fromMe && normalize(input.text) === "activar bot" ? 1 : 0);
      const raw = await this.app.redis.get(sessionKey);
      let session: Session | null = raw ? JSON.parse(raw) : null;
      const previousState = JSON.stringify(session);
      // The pause is separate from the expiring cart: a new day, menu request,
      // expired draft or customer-written command must never reclaim the chat.
      const humanKey = `${prefix}:human`;
      if (await this.app.redis.get(humanKey)) {
        session ??= { step: "human", checkoutId: crypto.randomUUID(), catalog: [], items: [] };
        session.step = "human"; delete session.confirmation; delete session.aiProposal;
      }
      const previousConfirmation = session?.confirmation?.code;
      const historyKey = `${prefix}:dialogue`;
      const recent: Array<{ customer: string; reply: string }> = JSON.parse(await this.app.redis.get(historyKey) || "[]");
      const text = normalize(input.text);
      let informational: string | null = null;
      const exactModifier = session?.step === "modifier" && session.selected &&
        selectModifiers(input.text, session.selected.modifiers[session.modifierIndex ?? 0]);
      const exactRequest = session && ["menu", "more", "modifier", "variant"].includes(session.step) &&
        exactCatalogRequest(input.text, await this.catalog());
      const informationalAllowed = session?.step !== "catalog_recovery" && !exactModifier && !exactRequest && !input.fromMe && session?.step !== "human" && !input.buttonId && !input.location && !input.catalogSelection && !input.unsupportedMedia &&
        !incomingDetails(input, session?.step || "") &&
        !pickupRequest(input.text) &&
        !/^(?:usar direccion|corregir)[.! ]*$/.test(text) && !(session?.step === "location_check" && /^(?:si|si claro|es la misma|la misma|correcto|no|es otra|otra)[.! ]*$/.test(text)) &&
        !(session?.imageRequest && (isDeliveryReference(input.text) || repeatsImageReference(input.text))) && !manualTopic(input.text) && !requestPolicyReply(input.text) && !asksIdentity(text) && !requestsHuman(text) && !needsHumanReview(text) && !requestsCancel(text) && !requestsOrderChange(text) &&
        !/^(preferencia:|guardar|recordar|borrar preferencias|confirmar|asesor|cancelar|elegir)/.test(text) && !browsesMenu(text) && !(session?.step === "bundle" && (!isQuestion(input.text) || !!session.textOrder && applySideSizes(structuredClone(session.textOrder), input.text))) && !((!session || ["menu", "more"].includes(session.step)) && isTextOrderCandidate(input.text));
      // Let the classifier understand free-form conversation, not just regex matches.
      // Explicit choices and personal checkout fields retain their existing handling.
      const knownQuestion = isQuestion(input.text);
      const semanticCandidate = !!text && !isGreeting(text) && !asksMenu(text) &&
        !/^\d+(?:\s*,\s*\d+)*$/.test(text) &&
        !/^(?:elegir|listo|recoger|omitir|exacto|efectivo|transferencia|tarjeta|si|no|ok|okay|sale|entendido|perfecto|gracias|muchas gracias|ok gracias|sale gracias|perfecto gracias|sin notas|usar direccion|corregir)[.! ]*$/.test(text) &&
        !/^(preferencia:|guardar|recordar|mis preferencias|borrar preferencias|usar preferencia|lo de siempre|repetir pedido)/.test(text) &&
        !["name", "address", "delivery_details", "notes", "payment", "cash", "confirm", "address_confirm", "location_check"].includes(session?.step || "");
      if (informationalAllowed && asksCurrentService(input.text)) {
        informational = await answerQuestion(this.app, input.text, recent);
      } else if (informationalAllowed && (knownQuestion || semanticCandidate)) {
        const rateKey = `${prefix}:questions:${Math.floor(Date.now() / 600000)}`;
        const count = await this.app.redis.incr(rateKey); await this.app.redis.expire(rateKey, 660);
        if (count <= 20) informational = await answerQuestion(this.app, input.text, recent);
        else if (knownQuestion) informational = "Puedes consultar el catálogo mientras tanto: " + catalogUrl() + ". Para más detalles, escribe ASESOR.";
      }
      if (!input.fromMe && !input.location && !input.buttonId && !input.catalogSelection && !input.unsupportedMedia && /^(?:gracias|muchas gracias|ok gracias|sale gracias|perfecto gracias|ok|okay|sale|entendido|perfecto)[.! ]*$/.test(text)) informational = "";
      if (informational && session?.textOrder) delete session.textOrder.quote;
      const result: BotReply = informational !== null ? { session, text: informational } : await this.advanceWithAI(session, input);
      if (informational === null && !input.fromMe && result.text && result.session &&
          !["confirm", "done", "human"].includes(result.session.step) && !browsesMenu(text) &&
          recent.length >= 2 && recent.slice(-2).every(turn => turn.reply.trim() === result.text.trim())) {
        result.session.step = "human"; delete result.session.confirmation; delete result.session.aiProposal;
        result.text = "Disculpa, no te voy a pedir que repitas lo mismo. El equipo sigue contigo por aquí para completar el pedido.";
        result.handoff = true;
      }
      if (result.session?.step === "human" && JSON.parse(previousState)?.step !== "human") result.handoff = true;
      if (await blocked()) return;
      if (result.text && !input.fromMe && process.env.WHATSAPP_AI_ENABLED === "true" && process.env.ANTHROPIC_API_KEY) {
        const rateKey = `${prefix}:writing:${Math.floor(Date.now() / 600000)}`;
        const count = await this.app.redis.incr(rateKey);
        await this.app.redis.expire(rateKey, 660);
        if (count <= 20) result.text = await writeReply({ message: input.text, authoritativeReply: result.text, recent });
      }
      if (await blocked()) return;
      if (await this.app.redis.get(lock) !== token) throw new Error("WhatsApp conversation lock expired");
      // Persist state, dedup marker, and response together. A send failure must
      // never replay the state transition or recreate a confirmed order.
      const tx = this.app.redis.multi();
      // A newer checkout state makes older prompts obsolete. FAQ replies do
      // not advance the checkout and must not discard an undelivered summary.
      const revisionKey = `${prefix}:reply-revision`;
      const stateChanged = previousState !== JSON.stringify(result.session);
      const revision = stateChanged ? crypto.randomUUID() : await this.app.redis.get(revisionKey);
      if (stateChanged) tx.set(revisionKey, revision!, { EX: 86400 });
      if (result.text && !input.fromMe) tx.set(historyKey, JSON.stringify([...recent, { customer: input.text.slice(0, 1000), reply: result.text.slice(0, 4000) }].slice(-3)), { EX: 1800 });
      if (result.session?.step === "human") tx.set(humanKey, result.handoff ? `handoff:${input.id}` : "1");
      else if (input.fromMe && text === "activar bot") {
        tx.del(humanKey); tx.del(historyKey); tx.del(attentionKeys(input.phone).unknown);
        tx.set(attentionKeys(input.phone).generation, String(replyGeneration));
      }
      if (result.session) tx.set(sessionKey, JSON.stringify(result.session), { EX: 86400 });
      else tx.del(sessionKey);
      tx.set(seen, "1", { EX: 604800 });
      const confirmation = result.session?.step === "confirm" && result.session.confirmation && result.session.confirmation.code !== previousConfirmation
        ? { checkoutId: result.session.checkoutId, code: result.session.confirmation.code } : undefined;
      const enqueue = (to: string, text: string, summary = false, staffNotification = false) => tx.rPush("notifications:queue", JSON.stringify({
        id: crypto.randomUUID(), type: "whatsapp", to, template: "bot_reply", params: { text }, attempts: 0, createdAt: new Date().toISOString(),
        ...(summary && confirmation ? { confirmation } : {}),
        ...(staffNotification ? { staffNotification: true } : { automation: { generation: replyGeneration, ...(informational === null && revision && result.session?.step !== "done" ? { revision } : {}), ...(result.handoff ? { handoffId: input.id } : {}) } }),
      }));
      if (result.text) {
        // Keep menus and summaries below WhatsApp's text payload size.
        let remaining = result.text;
        while (remaining) {
          let end = Math.min(remaining.length, 3500);
          if (end < remaining.length) {
            const newline = remaining.lastIndexOf("\n", end);
            if (newline > 0) end = newline + 1;
          }
          enqueue(input.phone, remaining.slice(0, end), end === remaining.length);
          remaining = remaining.slice(end);
        }
      }
      if (result.handoff) {
        const phones = (process.env.OWNER_PHONES || "").split(",").map(p => normalizarTelefono(p)).filter((p): p is string => Boolean(p));
        for (const phone of new Set(phones)) enqueue(phone, `Atención por WhatsApp solicitada: ${input.phone}. Revisa el chat del negocio. La asistencia automática está pausada para este cliente.`, false, true);
      }
      await tx.exec();
    } finally {
      await this.app.redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", { keys: [lock], arguments: [token] });
    }
  }
}
