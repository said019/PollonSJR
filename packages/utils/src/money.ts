/** Formatea centavos a string MXN: 7500 → "$75.00" */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Convierte centavos a número decimal: 7500 → 75.00 */
export function centsToMXN(cents: number): number {
  return cents / 100;
}
