import type { CartItem, ProductPublic } from "@pollon/types";

export interface CartItemIssue {
  /** Short label like "Faltan 2 Complementos" */
  message: string;
}

/**
 * Validate a cart line against the product's current modifier definition.
 * Returns the list of issues — empty array means the line is OK to checkout.
 *
 * Rules (must match ProductOptionsModal.validate so a re-edit always passes):
 *  - Variants present and required → item must have a variant chosen
 *  - Modifier with totalQuota → sum of picked qty must equal totalQuota
 *  - Modifier required (no quota) → at least 1 option picked
 *  - Modifier minSelect > 0 → total picked must meet the minimum
 */
export function validateCartItem(
  item: CartItem,
  product: ProductPublic | null | undefined
): CartItemIssue[] {
  const issues: CartItemIssue[] = [];
  if (!product) return issues;

  // Variant check
  if (product.variants && product.variants.length > 0 && !item.variant) {
    issues.push({ message: "Falta elegir tamaño" });
  }

  for (const mod of product.modifiers ?? []) {
    const itemMods = (item.modifiers ?? []).filter((m) => m.name === mod.name);
    const totalPicked = itemMods.reduce((s, m) => s + (m.qty ?? 1), 0);

    const hasQuota = typeof mod.totalQuota === "number" && mod.totalQuota > 0;
    if (hasQuota) {
      if (totalPicked !== mod.totalQuota) {
        const remaining = (mod.totalQuota ?? 0) - totalPicked;
        issues.push({
          message:
            remaining > 0
              ? `Faltan ${remaining} en "${mod.name}"`
              : `Sobran ${-remaining} en "${mod.name}"`,
        });
      }
      continue;
    }

    if (mod.required && totalPicked === 0) {
      issues.push({ message: `Falta elegir "${mod.name}"` });
      continue;
    }
    if (totalPicked < mod.minSelect) {
      issues.push({
        message: `"${mod.name}" requiere al menos ${mod.minSelect}`,
      });
    }
  }

  return issues;
}

/** True when at least one cart item has issues. */
export function cartHasIssues(
  items: CartItem[],
  productById: Map<string, ProductPublic>
): boolean {
  return items.some(
    (item) =>
      validateCartItem(item, productById.get(item.productId)).length > 0
  );
}

/**
 * True when the product needs a modal before it can be added to the cart
 * (i.e. has at least one required field).
 */
export function productNeedsOptions(product: ProductPublic): boolean {
  if (product.variants && product.variants.length > 0) return true;
  for (const mod of product.modifiers ?? []) {
    if (mod.required) return true;
    if (typeof mod.totalQuota === "number" && mod.totalQuota > 0) return true;
    if (mod.minSelect > 0) return true;
  }
  return false;
}
