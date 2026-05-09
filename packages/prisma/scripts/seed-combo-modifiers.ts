/**
 * Seed: agrega el modificador "Complementos" con cupos a cada Combo.
 *
 * Cupos por combo (según el menú impreso):
 *   - Combo Personal:  1
 *   - Combo Pareja:    2
 *   - Combo Familiar:  3
 *   - Combo Extra:     3
 *   - Combo Jumbo:     6
 *
 * Opciones (todas precio 0 — incluidas en el combo):
 *   - Puré de papa
 *   - Sopa de codito
 *   - Ensalada de zanahoria con col
 *
 * Idempotente: si ya existe un modificador con ese nombre en el producto,
 * lo actualiza; si no, lo crea. Nunca duplica.
 *
 * Ejecutar con:
 *   pnpm --filter @pollon/prisma tsx scripts/seed-combo-modifiers.ts
 *   # o
 *   DATABASE_URL=... npx tsx scripts/seed-combo-modifiers.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ComboCfg {
  /** Substring (case-insensitive) que aparece en Product.name */
  match: string;
  /** Cupos totales que el cliente reparte */
  totalQuota: number;
}

const COMBOS: ComboCfg[] = [
  { match: "personal",  totalQuota: 1 },
  { match: "pareja",    totalQuota: 2 },
  { match: "familiar",  totalQuota: 3 },
  { match: "extra",     totalQuota: 3 },
  { match: "jumbo",     totalQuota: 6 },
];

const MOD_NAME = "Complementos";

const OPTIONS = [
  { label: "Puré de papa",                  price: 0 },
  { label: "Sopa de codito",                price: 0 },
  { label: "Ensalada de zanahoria con col", price: 0 },
];

async function main() {
  // Pull all combos at once
  const products = await prisma.product.findMany({
    where: { category: "COMBOS" },
    include: { modifiers: true },
  });

  if (products.length === 0) {
    console.error("⚠️  No se encontraron productos en categoría COMBOS.");
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const cfg of COMBOS) {
    const product = products.find((p) =>
      p.name.toLowerCase().includes(cfg.match)
    );

    if (!product) {
      console.warn(`⚠️  No se encontró un combo con "${cfg.match}" en el nombre. Salteado.`);
      skipped++;
      continue;
    }

    const existing = product.modifiers.find(
      (m) => m.name.toLowerCase() === MOD_NAME.toLowerCase()
    );

    if (existing) {
      await prisma.productModifier.update({
        where: { id: existing.id },
        data: {
          required: true,
          minSelect: 0,
          maxSelect: cfg.totalQuota,
          totalQuota: cfg.totalQuota,
          options: OPTIONS,
          sortOrder: 0,
        },
      });
      console.log(
        `↻ Actualizado: "${product.name}" → ${cfg.totalQuota} cupos`
      );
      updated++;
    } else {
      await prisma.productModifier.create({
        data: {
          productId: product.id,
          name: MOD_NAME,
          required: true,
          minSelect: 0,
          maxSelect: cfg.totalQuota,
          totalQuota: cfg.totalQuota,
          options: OPTIONS,
          sortOrder: 0,
        },
      });
      console.log(
        `✓ Creado: "${product.name}" → ${cfg.totalQuota} cupos`
      );
      created++;
    }
  }

  console.log(
    `\nResumen: ${created} creados · ${updated} actualizados · ${skipped} omitidos`
  );
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
