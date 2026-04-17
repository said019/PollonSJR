import { z } from "zod";

export const createOrderSchema = z.object({
  type: z.enum(["DELIVERY", "PICKUP"]),
  paymentMethod: z.enum(["CARD", "CASH", "TRANSFER"]).default("CARD"),
  cashAmount: z.number().int().positive().optional(),
  couponCode: z.string().max(50).optional(),
  // Scheduled orders (day ahead)
  isScheduled: z.boolean().optional(),
  scheduledFor: z.string().datetime().optional(),
  address: z.string().optional(),
  deliveryLat: z.number().min(-90).max(90).optional(),
  deliveryLng: z.number().min(-180).max(180).optional(),
  deliveryZoneId: z.string().optional(),
  deliveryAddress: z.string().max(500).optional(),
  deliveryFee: z.number().int().min(0).optional(),
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
