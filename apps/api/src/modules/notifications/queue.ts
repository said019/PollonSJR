import crypto from "crypto";
import type { RedisClientType } from "redis";
import type { NotificationJob } from "./whatsapp.service";

const QUEUE_KEY = "notifications:queue";

/**
 * Add a notification job to the Redis queue.
 */
export async function enqueueNotification(
  redis: RedisClientType,
  job: Omit<NotificationJob, "id" | "attempts" | "createdAt">
) {
  const fullJob: NotificationJob = {
    ...job,
    id: crypto.randomUUID(),
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  await redis.rPush(QUEUE_KEY, JSON.stringify(fullJob));
}

/**
 * Background worker that processes the notification queue.
 * Uses BLPOP for blocking dequeue with 5s timeout.
 * Retries up to 3 times with exponential backoff.
 */
export async function startNotificationWorker(
  redis: RedisClientType,
  sendFn: (job: NotificationJob) => Promise<void>
) {
  console.log("📨 Notification worker started");

  while (true) {
    try {
      const result = await redis.blPop(QUEUE_KEY, 5);
      if (!result) continue;

      const job: NotificationJob = JSON.parse(result.element);

      try {
        await sendFn(job);
      } catch (e) {
        console.error(`❌ Notification ${job.id} failed:`, e);

        if (job.attempts < 3) {
          const delayMs = Math.pow(2, job.attempts) * 1000;
          setTimeout(async () => {
            try {
              await redis.rPush(
                QUEUE_KEY,
                JSON.stringify({ ...job, attempts: job.attempts + 1 })
              );
            } catch {}
          }, delayMs);
        } else {
          console.error(`🚫 Notification ${job.id} dropped after 3 retries`);
        }
      }
    } catch {
      // Redis connection error — wait and retry
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
