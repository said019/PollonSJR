import { z } from "zod";

export const calculateDeliverySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const updateZonesSchema = z.array(
  z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(100),
    minKm: z.number().min(0),
    maxKm: z.number().positive(),
    fee: z.number().int().min(0),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    active: z.boolean(),
    sortOrder: z.number().int().min(0),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
  })
);

export const updateStoreLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().min(1).max(500),
});
