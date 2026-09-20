import type { FastifyInstance } from "fastify";

export const APP_COMBO_PROMOTION_KEY = "combo-familiar-dedos-pollo-v1";
export const APP_COMBO_PROMOTION_MODIFIER =
  "Promo app: dedos de pollo GRATIS";
export const APP_COMBO_PROMOTION_PRODUCT = "Combo Familiar";
export const APP_COMBO_PROMOTION_SAUCES = [
  "BBQ Hot",
  "Mango",
  "Tamarindo",
] as const;

interface PromotionModifierInput {
  name: string;
  option: string;
  price: number;
  qty?: number;
}

interface PromotionItemInput {
  productId: string;
  qty: number;
  modifiers?: PromotionModifierInput[];
}

interface ProductNameLookup {
  id: string;
  name: string;
}

interface ProductPromotionAvailability extends ProductNameLookup {
  modifiers?: Array<{ name: string }>;
}

export function isAppComboPromotionEnabled(
  products: ProductPromotionAvailability[]
): boolean {
  return products.some(
    (product) =>
      product.name === APP_COMBO_PROMOTION_PRODUCT &&
      product.modifiers?.some(
        (modifier) => modifier.name === APP_COMBO_PROMOTION_MODIFIER
      )
  );
}

/**
 * Valida la promo especial enviada en un pedido y devuelve si se está usando.
 * El servidor no confía en el nombre, salsa, precio o cantidad del cliente.
 */
export function validateAppComboPromotion(
  items: PromotionItemInput[],
  products: ProductNameLookup[]
): boolean {
  const selections = items.flatMap((item) =>
    (item.modifiers ?? [])
      .filter((modifier) => modifier.name === APP_COMBO_PROMOTION_MODIFIER)
      .map((modifier) => ({ item, modifier }))
  );

  if (selections.length === 0) return false;
  if (selections.length !== 1) {
    throw new Error("La promoción de dedos de pollo solo puede usarse una vez por pedido.");
  }

  const { item, modifier } = selections[0];
  const product = products.find((candidate) => candidate.id === item.productId);
  if (product?.name !== APP_COMBO_PROMOTION_PRODUCT) {
    throw new Error("La promoción solo aplica al Combo Familiar.");
  }
  if (item.qty !== 1 || (modifier.qty ?? 1) !== 1) {
    throw new Error("La promoción incluye una sola orden de dedos de pollo.");
  }
  if (
    !APP_COMBO_PROMOTION_SAUCES.includes(
      modifier.option as (typeof APP_COMBO_PROMOTION_SAUCES)[number]
    ) ||
    modifier.price !== 0
  ) {
    throw new Error("Selecciona BBQ Hot, Mango o Tamarindo para la promoción.");
  }

  return true;
}

export async function releaseAppComboPromotion(
  app: FastifyInstance,
  orderId: string
) {
  await app.prisma.customerPromotionRedemption.deleteMany({
    where: { orderId, promotionKey: APP_COMBO_PROMOTION_KEY },
  });
}
