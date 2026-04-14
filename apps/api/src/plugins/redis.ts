import { FastifyInstance } from "fastify";
import { createClient, RedisClientType } from "redis";

declare module "fastify" {
  interface FastifyInstance {
    redis: RedisClientType;
    redisSub: RedisClientType;
  }
}

export async function registerRedis(app: FastifyInstance) {
  const url = process.env.REDIS_URL || "redis://localhost:6379";

  const redis = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 500, 30_000),
    },
  }) as RedisClientType;

  const redisSub = redis.duplicate() as RedisClientType;

  redis.on("error", (err) => app.log.error("Redis error:", err));
  redis.on("reconnecting", () => app.log.warn("Redis reconnecting..."));
  redis.on("ready", () => app.log.info("Redis ready"));

  await redis.connect();
  await redisSub.connect();

  app.decorate("redis", redis);
  app.decorate("redisSub", redisSub);

  app.addHook("onClose", async () => {
    await redis.quit();
    await redisSub.quit();
  });
}
