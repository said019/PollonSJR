/**
 * Product image map — resolves a product's display image by its name.
 *
 * The DB `imageUrl` column may be null, so this map acts as a reliable
 * frontend-side fallback keyed on the canonical product name from the seed.
 *
 * If a product already has an `imageUrl` from the DB, that takes precedence.
 */

const PRODUCT_IMAGES: Record<string, string> = {
  // POLLO FRITO — bucket shot de pollo con bisquets y complementos
  "2 Piezas": "/menu/pollo-frito.jpeg",
  "4 Piezas": "/menu/pollo-frito.jpeg",
  "6 Piezas": "/menu/pollo-frito.jpeg",
  "8 Piezas": "/menu/pollo-frito.jpeg",
  "12 Piezas": "/menu/pollo-frito.jpeg",

  // COMBOS — spread completo / familiar
  "Combo Personal": "/menu/tiras-pollo-papas.jpeg",
  "Combo Pareja": "/menu/hero-spread.jpeg",
  "Combo Familiar": "/menu/combo-familiar.jpeg",
  "Combo Extra": "/menu/combo-familiar.jpeg",
  "Combo Jumbo": "/menu/combo-familiar.jpeg",

  // HAMBURGUESAS
  "Hamburguesa Arrachera": "/menu/hamburguesa-arrachera.jpeg",
  "Hamburguesa Crujiente": "/menu/hamburguesas-dobles.jpeg",
  "Hamburguesa de Res": "/menu/hamburguesas-dobles.jpeg",
  "Hot-Dog": "/menu/hamburguesas-dobles.jpeg",
  "Hot-Dog 3 piezas": "/menu/hamburguesas-dobles.jpeg",

  // SNACKS
  "Banderillas": "/menu/tiras-pollo-papas.jpeg",
  "Papas a la Francesa": "/menu/tiras-pollo-papas.jpeg",
  "Nuggets x6": "/menu/nuggets.jpeg",
  "Papas al Gajo": "/menu/tiras-pollo-papas.jpeg",
  "Aros de Cebolla": "/menu/aros-cebolla.jpeg",
  "Dedos de Queso": "/menu/nuggets.jpeg",
  "Boneless": "/menu/boneless.jpeg",
  "Alitas 1/2 kg": "/menu/boneless-dip.jpeg",

  // FLAUTAS
  "Flautas x4": "/menu/flautas.jpeg",

  // COMPLEMENTOS
  "Complemento Chico": "/menu/combo-familiar.jpeg",
  "Complemento Grande": "/menu/combo-familiar.jpeg",
  "Bisquet": "/menu/bisquet.jpeg",
  "Puré de Papa": "/menu/combo-familiar.jpeg",
  "Sopa": "/menu/combo-familiar.jpeg",
  "Ensalada": "/menu/combo-familiar.jpeg",
  "Salsa Extra": "/menu/boneless-dip.jpeg",

  // BEBIDAS
  "Refresco": "/menu/soda-italiana.jpeg",
  "Arizona": "/menu/soda-italiana.jpeg",
  "Soda Italiana": "/menu/siropes-kala.jpeg",
  "Soda Explosiva": "/menu/soda-explosiva.jpeg",
  "Malteada": "/menu/malteada-oreo.jpeg",
  "Agua 1/2 L": "/menu/agua-sabor.jpeg",
  "Agua 1 L": "/menu/agua-sabor.jpeg",
  "Agua de Sabor 500ml": "/menu/agua-sabor.jpeg",
  "Café o Té": "/menu/cafe-baileys.jpeg",
};

/** Category-level hero imagery, used in category navigation + cover art. */
export const CATEGORY_IMAGES: Record<string, string> = {
  POLLO_FRITO: "/menu/pollo-frito.jpeg",
  COMBOS: "/menu/combo-familiar.jpeg",
  HAMBURGUESAS: "/menu/hamburguesa-arrachera.jpeg",
  SNACKS: "/menu/boneless-dip.jpeg",
  FLAUTAS: "/menu/flautas.jpeg",
  COMPLEMENTOS: "/menu/bisquet.jpeg",
  BEBIDAS: "/menu/malteada-oreo.jpeg",
};

/** Emoji-based tag for each category — used in chips and headings. */
export const CATEGORY_EMOJI: Record<string, string> = {
  POLLO_FRITO: "🍗",
  COMBOS: "🥡",
  HAMBURGUESAS: "🍔",
  SNACKS: "🍟",
  FLAUTAS: "🌮",
  COMPLEMENTOS: "🥗",
  BEBIDAS: "🥤",
};

/**
 * Resolve a product's image URL.
 * DB value wins; otherwise fall back to the curated map; otherwise null.
 */
export function resolveProductImage(
  productName: string,
  dbImageUrl: string | null,
): string | null {
  if (dbImageUrl && dbImageUrl.trim().length > 0) return dbImageUrl;
  return PRODUCT_IMAGES[productName] ?? null;
}
