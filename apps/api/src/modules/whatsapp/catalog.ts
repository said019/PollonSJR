import { readPublicCatalog } from "./public-catalog";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { normalizarTelefono } from "../../utils/phone";

export const catalogLineSchema = z.object({ id: z.string().min(1).max(100), quantity: z.number().int().min(1).max(20) });
export type CatalogLine = z.infer<typeof catalogLineSchema>;
export type CatalogSelection = { sellerJid: string; lines?: CatalogLine[]; orderId?: string; token?: string; singleProduct?: boolean; itemCount?: number };
export const sellerPhone = () => normalizarTelefono(process.env.WHATSAPP_CATALOG_PHONE || "5214428219534")!;
export const catalogUrl = () => `https://wa.me/c/${process.env.WHATSAPP_CATALOG_PHONE || "5214428219534"}`;

export async function evolutionBusinessRead(path: "getCatalog" | "getOwnCatalog" | "getOrderDetails", body: object) {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!url || !key || !instance) throw new Error("Evolution no configurado");
  const res = await fetch(`${url}/business/${path}/${encodeURIComponent(instance)}`, {
    method: "POST", headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Consulta de catálogo no disponible (${res.status})`);
  return res.json();
}

export async function readOwnCatalog() {
  let raw: unknown;
  try { raw = await evolutionBusinessRead("getOwnCatalog", {}); }
  catch { return readPublicCatalog((process.env.WHATSAPP_CATALOG_PHONE || "5214428219534") + "@s.whatsapp.net"); }
  const parsed = z.object({
    wuid: z.string().regex(/^\d{11,15}@s\.whatsapp\.net$/),
    catalog: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), retailerId: z.string().optional() })).max(1000),
    nextPageCursor: z.string().nullish(),
  }).parse(raw);
  if (normalizarTelefono(parsed.wuid.split("@")[0]) !== sellerPhone()) throw new Error("Catálogo de otro negocio");
  if (parsed.nextPageCursor) throw new Error("Catálogo incompleto: requiere paginación");
  return parsed.catalog;
}

export async function resolveCatalog(app: FastifyInstance, selection: CatalogSelection) {
  if (!/^\d{11,15}@s\.whatsapp\.net$/.test(selection.sellerJid) ||
      normalizarTelefono(selection.sellerJid.split("@")[0]) !== sellerPhone()) throw new Error("Catálogo de otro negocio");
  let lines = selection.lines;
  if (!lines) {
    if (!selection.orderId || !selection.token) throw new Error("Carrito incompleto");
    // This endpoint is the read-only Evolution extension included under
    // integrations/evolution. Stock Evolution doesn't expose getOrderDetails.
    const result = await evolutionBusinessRead("getOrderDetails", { orderId: selection.orderId, token: selection.token, sellerJid: selection.sellerJid });
    lines = z.object({ products: z.array(catalogLineSchema).min(1).max(30) }).parse(result).products;
  }
  lines = z.array(catalogLineSchema).min(1).max(30).parse(lines);
  if (selection.itemCount !== undefined && lines.reduce((n, line) => n + line.quantity, 0) !== selection.itemCount) throw new Error("Carrito incompleto");
  const unique = new Map<string, number>();
  for (const line of lines) unique.set(line.id, (unique.get(line.id) ?? 0) + line.quantity);
  if ([...unique.values()].some(qty => qty > 20)) throw new Error("Cantidad fuera de límite");
  const links = await app.prisma.whatsAppCatalogLink.findMany({ where: { sellerPhone: sellerPhone(), externalId: { in: [...unique.keys()] } } });
  return [...unique].map(([externalId, qty]) => {
    const link = links.find(l => l.externalId === externalId);
    if (!link) throw new Error("Producto del catálogo sin vincular");
    return { productId: link.productId, qty, variant: link.variant ?? undefined };
  });
}
