import type { CatalogProduct, QueuedProduct } from "./text-order";

const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/coca[ -]cola/g, "coca").replace(/\bcoca de (?=\d)/g, "coca ").replace(/\b(\d+)\s*(?:ml|mililitros)\b/g, "$1")
  .replace(/\s+/g, " ").trim();

// Only explicit quantities and an exact catalog name/presentation qualify.
// Free-form interpretations still use the clarification flow; prices never
// come from the message. A size in a product name is not a second quantity.
export function exactCatalogRequest(message: string, catalog: CatalogProduct[]): QueuedProduct | null {
  let text = normalize(message).replace(/[.!]+$/, "").replace(/ por favor$/, "").trim();
  text = text.replace(/^(?:y |ademas |agrega |agregame )/, "")
    .replace(/^(?:quisiera |quiero |me das |dame |me puedes dar )/, "");
  const quantity = /^(una orden de|un paquete de|el paquete de|un|una|el|\d+) (.+)$/.exec(text);
  if (!quantity) return null;
  const qty = /^\d+$/.test(quantity[1]) ? Number(quantity[1]) : 1;
  if (!Number.isInteger(qty) || qty < 1 || qty > 20) return null;
  const requested = quantity[2].replace(/^paquete de /, "");
  const matches: QueuedProduct[] = [];
  for (const product of catalog) {
    const name = normalize(product.name);
    if (name === requested) matches.push({ productId: product.id, qty });
    for (const variant of product.variants ?? []) {
      const label = normalize(variant.label);
      if (`${name} ${label}` === requested || `${name} de ${label}` === requested)
        matches.push({ productId: product.id, qty, variant: variant.label });
    }
  }
  return matches.length === 1 ? matches[0] : null;
}
