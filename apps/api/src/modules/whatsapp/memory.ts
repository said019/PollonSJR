import type { FastifyInstance } from "fastify";
import { z } from "zod";

export const rememberedBasketSchema = z.array(z.object({
  productId: z.string(), qty: z.number().int().min(1).max(20), variant: z.string().optional(),
  modifiers: z.array(z.object({ name: z.string(), option: z.string(), qty: z.number().int().min(1).max(50) })).max(100),
})).min(1).max(30);
export type RememberedBasket = z.infer<typeof rememberedBasketSchema>;

export class WhatsAppMemory {
  constructor(private app: FastifyInstance) {}
  async read(phone: string) {
    const stored = await this.app.prisma.whatsAppPreference.findUnique({ where: { phone } });
    if (!stored) return null;
    if (stored.expiresAt <= new Date()) {
      await this.app.prisma.whatsAppPreference.deleteMany({ where: { phone, expiresAt: { lte: new Date() } } });
      return null;
    }
    const basket = rememberedBasketSchema.safeParse(stored.basket);
    return { note: stored.note, basket: basket.success ? basket.data : null };
  }
  async save(phone: string, value: { note?: string; basket?: RememberedBasket }) {
    const now = new Date();
    await this.app.prisma.whatsAppPreference.deleteMany({ where: { phone, expiresAt: { lte: now } } });
    const data = {
      ...(value.note !== undefined ? { note: z.string().min(1).max(350).parse(value.note) } : {}),
      ...(value.basket ? { basket: rememberedBasketSchema.parse(value.basket) } : {}),
      consentAt: now, expiresAt: new Date(now.getTime() + 180 * 86400000),
    };
    await this.app.prisma.whatsAppPreference.upsert({ where: { phone }, update: data, create: { phone, ...data } });
  }
  async forget(phone: string) { await this.app.prisma.whatsAppPreference.deleteMany({ where: { phone } }); }
}
