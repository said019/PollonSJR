import { z } from "zod";

export const createOrderSchema = z.object({
  type: z.enum(["DELIVERY", "PICKUP"]),
  paymentMethod: z.enum(["CARD", "CASH", "TRANSFER"]).default("CARD"),
  cashAmount: z.number().int().positive().optional(),
  couponCode: z.string().max(50).optional(),
  promotionId: z.string().max(50).optional(),
  tipAmount: z.number().int().min(0).max(500000).optional(),
  // Scheduled orders (day ahead)
  isScheduled: z.boolean().optional(),
  scheduledFor: z.string().datetime().optional(),
  address: z.string().optional(),
  deliveryLat: z.number().min(-90).max(90).nullable().optional(),
  deliveryLng: z.number().min(-180).max(180).nullable().optional(),
  deliveryZoneId: z.string().nullable().optional(),
  deliveryAddress: z.string().max(500).nullable().optional(),
  deliveryFee: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        qty: z.number().int().positive().max(20),
        variant: z.string().optional(),
        notes: z.string().max(200).optional(),
        modifiers: z
          .array(
            z.object({
              name: z.string(),
              option: z.string(),
              price: z.number().int().min(0),
              qty: z.number().int().min(1).max(50).optional(),
            })
          )
          .optional(),
      })
    )
    .min(1)
    .max(30),
});

export const updateStatusSchema = z.object({
  status: z.enum([
    "RECEIVED",
    "PREPARING",
    "READY",
    "ON_THE_WAY",
    "DELIVERED",
    "CANCELLED",
  ]),
  cancelReason: z.string().max(500).optional(),
});
