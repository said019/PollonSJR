import type { CatalogProduct } from "./text-order";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const count = (s: string) => (({ un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 } as Record<string, number>)[s] ?? Number(s));
const clean = (s: string) => norm(s).replace(/[¿?¡!.,;:]+/g, " ").replace(/\s+/g, " ").trim().replace(/ por favor$/, "");
export const startsOrder = (s: string) => /^(?:hacer (?:un )?pedido|quiero (?:hacer (?:un )?pedido|pedir)|quisiera hacer (?:un )?pedido)$/.test(clean(s));
export type PriceRequest = { amount: number; qty: number; destination?: string };
export function parsePriceRequest(message: string): PriceRequest | null {
  // The complete request must fit; trailing discounts/changes cannot disappear.
  const text = norm(message).replace(/^[¿¡]/, "").replace(/[?!]+$/, "")
    .replace(/^(?:(?:hola|buenas tardes|buenos dias|buen dia|buenas noches)[,.! ]*)+/, "")
    .replace(/ por favor[.! ]*$/, "").trim();
  const m = /^(?:(?:me )?(?:puedes|podrias) (?:enviar|mandar|dar|traer)|mandame|enviame|dame|quiero|quisiera|ocupo|necesito)?\s*(el|un|una|dos|tres|cuatro|cinco|seis|\d+)?\s*(?:paquetes?|combos?)(?: de pollo)? de \$?\s*(\d+(?:\.\d{1,2})?)(?: pesos)?(?: (?:al|a la|a|para el|para la) (.+))?[.! ]*$/.exec(text);
  if (!m) return null;
  const qty = !m[1] || m[1] === "el" ? 1 : count(m[1]);
  const amount = Math.round(Number(m[2]) * 100);
  const destination = m[3]?.replace(/[.! ]+$/, "");
  if (!Number.isInteger(qty) || qty < 1 || qty > 20 || amount <= 0 || amount > 1000000 ||
      destination && (destination.length > 350 || /\b(?:gratis|descuento|ignora|instrucciones|confirmar|sin pagar|y (?:un|una|dos|tres|sin|con|agrega|quita))\b/.test(destination))) return null;
  return { amount, qty, ...(destination ? { destination } : {}) };
}
export const pricedPackages = (request: PriceRequest, products: CatalogProduct[]) => products.filter(p =>
  /^(?:combo|paquete)\b/.test(norm(p.name)) && p.price === request.amount && !p.variants?.length);

type Flavor = "pure" | "ensalada" | "sopa";
export type SideRequest = { qty: number; flavor: Flavor; replace?: Flavor; target?: string };
const flavor = (s: string): Flavor => s.startsWith("pure") ? "pure" : s.startsWith("ensalada") ? "ensalada" : "sopa";
export function parseSideRequest(message: string): SideRequest | null {
  const targetMatch = / (?:para|en) el (combo .+|paquete .+)$/.exec(clean(message));
  let text = (targetMatch ? clean(message).slice(0, targetMatch.index) : clean(message)).replace(/^(?:ok|si|claro)\s+/, "")
    .replace(/^(?:me )?(?:puedes|podrias) cambiar /, "cambia ")
    .replace(/^(?:(?:me )?(?:puedes|podrias) (?:mandar|enviar|poner|dar)|mandame|ponme|quiero|quisiera|mejor|cambia a)\s+/, "");
  const m = /^(un|una|uno|dos|tres|cuatro|cinco|seis|\d+) (pures?(?: de papa)?|ensaladas?(?: de (?:col|zanahoria)(?: con col)?)?|sopas?(?: de codito)?)(?: (?:en lugar de|en vez de) (?:la |el |las |los )?(ensaladas?|pures?|sopas?))?$/.exec(text);
  const swap = /^(?:cambia|cambiame) (?:la |el )?(ensalada|pure|sopa) por (un|una|uno|dos|tres|cuatro|cinco|seis|\d+) (pures?(?: de papa)?|ensaladas?|sopas?)$/.exec(text);
  if (!m && !swap) return null;
  const qty = count(m ? m[1] : swap![2]);
  if (!Number.isInteger(qty) || qty < 1 || qty > 20) return null;
  return { qty, flavor: flavor(m ? m[2] : swap![3]), ...(targetMatch ? { target: targetMatch[1] } : {}), ...((m?.[3] || swap) ? { replace: flavor(m?.[3] || swap![1]) } : {}) };
}
export type ModifierPick = { name: string; option: string; price: number; qty: number };
export function reviseSides(request: SideRequest, mod: CatalogProduct["modifiers"][number], current: ModifierPick[]): ModifierPick[] | null {
  const options = mod.options.filter(o => norm(o.label).startsWith(request.flavor));
  if (options.length !== 1) return null;
  const minimum = mod.totalQuota ?? Math.max(mod.minSelect, mod.required ? 1 : 0);
  const maximum = mod.totalQuota ?? mod.maxSelect;
  if (request.qty > maximum) return null;
  const option = options[0];
  let picks: ModifierPick[];
  if (request.qty === maximum) picks = [{ name: mod.name, option: option.label, price: option.price, qty: request.qty }];
  else if (request.replace) {
    const replaced = current.filter(p => p.name === mod.name && norm(p.option).startsWith(request.replace!));
    if (replaced.reduce((n, p) => n + p.qty, 0) !== request.qty) return null;
    picks = [...current.filter(p => p.name === mod.name && !norm(p.option).startsWith(request.replace!)), { name: mod.name, option: option.label, price: option.price, qty: request.qty }];
  } else picks = [{ name: mod.name, option: option.label, price: option.price, qty: request.qty }];
  const merged: ModifierPick[] = [];
  for (const pick of picks) {
    const trusted = mod.options.find(o => o.label === pick.option);
    if (!trusted) return null;
    const previous = merged.find(p => p.option === pick.option);
    if (previous) previous.qty += pick.qty;
    else merged.push({ ...pick, price: trusted.price });
  }
  const total = merged.reduce((n, p) => n + p.qty, 0);
  if (total < minimum || total > maximum || !mod.totalQuota && merged.some(p => p.qty > 1)) return null;
  return merged;
}
