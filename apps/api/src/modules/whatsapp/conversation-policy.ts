import { normalizarTelefono } from "../../utils/phone";

export type ManualTopic = "employment" | "operations" | "supplier" | "existing_order" | "manual_context";
const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// High-confidence routing, not a general intent model or a security boundary.
// A match pauses the conversation BEFORE FAQ, order extraction or free-form fields.
export function manualTopic(value: string): ManualTopic | null {
  const text = normalize(value);
  if (/^(?:[¡¿!?.\s]*)(?:hay pedidos?|sale lo espero|lo espero|ya me atendieron)(?:[¡¿!?.\s]*)$/.test(text) ||
      /\b(?:ya (?:me esta|me estan|estoy) (?:atendiendo|hablando)|estoy hablando con (?:el encargado|la encargada|alguien del equipo))\b/.test(text)) return "manual_context";
  if (/\b(?:vacantes?|empleo|contratacion|curriculum|curriculo|cv|solicitud de trabajo|bolsa de trabajo)\b/.test(text) ||
      /\b(?:busco|buscando|solicito|ofrecen|ofrece|tienen|tiene|dan|hay)\s+(?:un\s+)?trabajo\b/.test(text) ||
      /\b(?:quiero|puedo|gustaria)\s+(?:ir a |entrar a )?trabajar (?:con ustedes|ahi|alli)\b/.test(text)) return "employment";
  if (/\b(?:soy|somos|voy de|vengo de)\s+(?:el |la |su |un |una )?(?:repartidor[ae]?s?|mensajer[oa]|proveedor[ae]?s?)\b/.test(text) ||
      /\b(?:si|cuando)\s+(?:hoy\s+)?(?:tienen|tengan|hay)\s+pedidos?\b.{0,60}\b(?:marcan|llaman|avisan|avisen|llamen)\b/.test(text) ||
      /\b(?:estoy|ando)\s+(?:disponible|libre)\s+para\s+(?:repartir|llevar pedidos|entregar pedidos)\b/.test(text) ||
      /\b(?:paso|voy)\s+(?:por|a recoger)\s+(?:el |un |su )?pedido\s+(?:de|para)\s+(?:uber|didi|rappi)\b/.test(text)) return "operations";
  if (/\b(?:les|te)\s+(?:ofrezco|ofrecemos|vendo|vendemos|surtimos)\b|\b(?:factura de proveedor|pago a proveedor|pedido de insumos|entrega de mercancia)\b/.test(text)) return "supplier";
  if (/\b(?:mi|el)\s+pedido\s+(?:no (?:ha )?llegado|no llega|no llego|llego (?:mal|incompleto|frio)|esta (?:mal|incompleto))\b/.test(text) ||
      /\b(?:cuanto (?:falta|tarda)|donde (?:esta|viene)|ya (?:salio|viene|va))\b.{0,35}\b(?:mi pedido|el pedido|mi comida|el repartidor)\b/.test(text) ||
      /\b(?:ya (?:pague|transferi|deposite)|comprobante de (?:pago|transferencia)|reembolso|devolucion de dinero|cobro (?:doble|duplicado)|me cobraron (?:doble|de mas)|me faltaron|me falto)\b/.test(text) ||
      /\b(?:necesito|quiero|solicito|pueden hacerme|me (?:hacen|haces|mandas|envias))\b.{0,25}\b(?:factura|facturar)\b/.test(text)) return "existing_order";
  return null;
}

export function manualTopicReply(topic: ManualTopic): string {
  if (topic === "operations" || topic === "supplier" || topic === "manual_context") return "";
  if (topic === "employment") return "Gracias por escribirnos. Los temas de empleo los atiende directamente el equipo por aquí.";
  return "Ese tema necesita que el equipo revise tu pedido contigo. Puedes continuar por aquí.";
}

// Explicit private configuration only. Never infer a contact's role from their
// name, or copy a personal contact list into the repository.
export function isExcludedContact(phone: string): boolean {
  const canonical = (value: string) => normalizarTelefono(value) ?? value.replace(/\D/g, "");
  const current = canonical(phone);
  return Boolean(current) && (process.env.WHATSAPP_BOT_EXCLUDED_PHONES || "").split(",")
    .some(value => value.trim() && canonical(value) === current);
}
