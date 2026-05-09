import { FastifyInstance } from "fastify";
import { calculateDeliveryFee, DeliveryResult } from "../../utils/delivery-fee";

export class DeliveryService {
  constructor(private app: FastifyInstance) {}

  private async getStoreLocation() {
    const cached = await this.app.redis.get("store:location");
    if (cached) return JSON.parse(cached) as { lat: number; lng: number; address: string };

    const loc = await this.app.prisma.storeLocation.findUnique({
      where: { id: "singleton" },
    });
    if (!loc) throw new Error("Store location not configured");

    await this.app.redis.set("store:location", JSON.stringify(loc), { EX: 300 });
    return loc;
  }

  private async getActiveZones() {
    const cached = await this.app.redis.get("delivery:zones");
    if (cached) return JSON.parse(cached);

    const zones = await this.app.prisma.deliveryZone.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });

    await this.app.redis.set("delivery:zones", JSON.stringify(zones), { EX: 60 });
    return zones;
  }

  async calculate(clientLat: number, clientLng: number): Promise<DeliveryResult> {
    const store = await this.getStoreLocation();
    const zones = await this.getActiveZones();
    return calculateDeliveryFee(store.lat, store.lng, clientLat, clientLng, zones);
  }

  async getAllZones() {
    return this.app.prisma.deliveryZone.findMany({ orderBy: { sortOrder: "asc" } });
  }

  async saveZones(zones: Array<{
    id?: string;
    name: string;
    minKm: number;
    maxKm: number;
    fee: number;
    color: string;
    active: boolean;
    sortOrder: number;
    startTime?: string | null;
    endTime?: string | null;
  }>) {
    // Delete existing zones and recreate
    await this.app.prisma.$transaction(async (tx) => {
      await tx.deliveryZone.deleteMany();
      for (const zone of zones) {
        const { id, ...data } = zone;
        await tx.deliveryZone.create({
          data: {
            ...data,
            startTime: data.startTime ?? null,
            endTime: data.endTime ?? null,
          },
        });
      }
    });

    await this.app.redis.del("delivery:zones");
    return this.getAllZones();
  }

  async getStoreLocationPublic() {
    return this.getStoreLocation();
  }

  async updateStoreLocation(lat: number, lng: number, address: string) {
    const result = await this.app.prisma.storeLocation.upsert({
      where: { id: "singleton" },
      update: { lat, lng, address },
      create: { id: "singleton", lat, lng, address },
    });

    await this.app.redis.del("store:location");
    return result;
  }
}
