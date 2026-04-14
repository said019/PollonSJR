import { FastifyInstance } from "fastify";
import { PrismaClient } from "@pollon/prisma";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export async function registerPrisma(app: FastifyInstance) {
  const prisma = new PrismaClient();
  await prisma.$connect();

  app.decorate("prisma", prisma);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
}
