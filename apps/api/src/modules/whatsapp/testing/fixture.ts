import { productSchema } from "../bot";

// In-memory doubles only. No production clients, connections or env files.
const product = productSchema.parse({ id: "pollo", name: "Pollo", price: 15000, variants: null, modifiers: [] });

export function createSimulationFixture() {
  const storage = new Map<string, string>();
  const queue: string[] = [];
  const orders = new Map<string, any>();
  const preferences = new Map<string, any>();
  const links: any[] = [];
  const config = { isOpen: true, acceptOrders: true, deliveryActive: true, openDays: [], openTime: "00:00", closeTime: "24:00" };
  storage.set("store:config", JSON.stringify(config));
  let creates = 0;
  const redis: any = {
    get: async (key: string) => storage.get(key) ?? null,
    set: async (key: string, value: string, options?: { NX?: boolean }) => {
      if (options?.NX && storage.has(key)) return null;
      storage.set(key, value); return "OK";
    },
    eval: async (_script: string, options: any) => {
      if (storage.get(options.keys[0]) === options.arguments[0]) storage.delete(options.keys[0]);
    },
    rPush: async (_key: string, value: string) => queue.push(value),
    multi: () => {
      const actions: Array<() => void> = [];
      const tx: any = {
        set: (k: string, v: string) => { actions.push(() => { storage.set(k, v); }); return tx; },
        del: (k: string) => { actions.push(() => { storage.delete(k); }); return tx; },
        rPush: (_k: string, v: string) => { actions.push(() => { queue.push(v); }); return tx; },
        exec: async () => { actions.forEach(fn => fn()); },
      };
      return tx;
    },
  };
  const app: any = {
    redis, log: { warn() {}, error() {} }, io: { to: () => ({ emit() {} }) },
    prisma: {
      whatsAppCatalogLink: { findMany: async () => links },
      whatsAppPreference: {
        findUnique: async ({ where }: any) => preferences.get(where.phone) ?? null,
        upsert: async ({ where, create, update }: any) => {
          const value = preferences.has(where.phone) ? { ...preferences.get(where.phone), ...update } : create;
          preferences.set(where.phone, value); return value;
        },
        deleteMany: async ({ where }: any) => {
          const value = preferences.get(where.phone);
          if (value && (!where.expiresAt || value.expiresAt <= where.expiresAt.lte)) preferences.delete(where.phone);
        },
      },
      product: { findMany: async () => [product] },
      deliveryZone: { findUnique: async ({ where }: any) => JSON.parse(storage.get("delivery:zones") || "[]").find((zone: any) => zone.id === where.id) ?? null },
      customer: { upsert: async () => ({ id: "customer" }), findUnique: async () => ({ blocked: false }) },
      order: {
        findUnique: async ({ where }: any) => where.whatsappCheckoutId ? orders.get(where.whatsappCheckoutId) ?? null : null,
        create: async ({ data }: any) => {
          if (orders.has(data.whatsappCheckoutId)) throw new Error("unique checkout constraint");
          creates++;
          const order = { ...data, id: "order-1", customer: { name: "Ana", phone: "4271234567" }, _count: { items: data.items.create.length }, createdAt: new Date() };
          orders.set(data.whatsappCheckoutId, order);
          return order;
        },
      },
      $queryRaw: async () => [{ seq: 1 }],
    },
  };
  return { app, storage, queue, orders, preferences, links, config, creates: () => creates };
}

