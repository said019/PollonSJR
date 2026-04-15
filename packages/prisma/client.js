const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

module.exports = { prisma, PrismaClient };
module.exports.default = prisma;

// Re-export all Prisma types for downstream consumers
Object.assign(module.exports, require("@prisma/client"));
