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

export const productTagEnum = z.enum([
  "vegetariano",
  "vegano",
  "picante",
  "muy_picante",
  "sin_gluten",
  "sin_lactosa",
  "favorito",
  "nuevo",
  "saludable",
  "kids",
  "para_compartir",
]);

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  category: categoryEnum,
  price: z.number().int().positive(),
  emoji: z.string().max(8).optional(),
  imageUrl: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  variants: z
    .array(z.object({ label: z.string().min(1).max(50), price: z.number().int().min(0) }))
    .nullable()
    .optional(),
  tags: z.array(productTagEnum).optional(),
  sortOrder: z.number().int().default(0),
});

export const updateProductSchema = createProductSchema.partial().extend({
  active: z.boolean().optional(),
  soldOut: z.boolean().optional(),
});

export const modifierSchema = z.object({
  name: z.string().min(1).max(80),
  required: z.boolean().default(false),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  totalQuota: z.number().int().min(1).max(99).nullable().optional(),
  options: z.array(
    z.object({
      label: z.string().min(1).max(60),
      price: z.number().int().min(0).default(0),
    })
  ).min(1),
  sortOrder: z.number().int().default(0),
});
