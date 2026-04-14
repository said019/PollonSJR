import { z } from "zod";

export const categoryEnum = z.enum([
  "POLLO_FRITO",
  "COMBOS",
  "HAMBURGUESAS",
  "SNACKS",
  "FLAUTAS",
  "COMPLEMENTOS",
  "BEBIDAS",
]);

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  category: categoryEnum,
  price: z.number().int().positive(),
  imageUrl: z.string().url().optional(),
  variants: z
    .array(z.object({ label: z.string(), price: z.number().int().positive() }))
    .optional(),
  sortOrder: z.number().int().default(0),
});

export const updateProductSchema = createProductSchema.partial().extend({
  active: z.boolean().optional(),
  soldOut: z.boolean().optional(),
});
