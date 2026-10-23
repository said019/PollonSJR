import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Incoming } from "./bot";
import { generation } from "./attention";

const ready = "wa:inbox:ready";
export const inboxKeys = (phone: string) => ({ queue: `wa:inbox:${phone}:queue`, lock: `wa:inbox:${phone}:lock`, reply: `wa:inbox:${phone}:reply` });
export class WhatsAppInbox {
  constructor(private app: FastifyInstance, private handle: (input: Incoming, deferReply: boolean) => Promise<void>) {}

  async receive(messages: Incoming[]) {
    for (const input of messages) {
      const keys = inboxKeys(input.phone);
      await this.app.redis.eval(`-- whatsapp-inbox-enqueue
        if redis.call('EXISTS', KEYS[3]) == 1 then return 0 end
        if redis.call('LLEN', KEYS[1]) >= 100 then return redis.error_reply('Inbox capacity exceeded') end
        redis.call('RPUSH', KEYS[1], ARGV[1])
        redis.call('SET', KEYS[3], '1', 'EX', 604800)
        redis.call('SADD', KEYS[2], ARGV[2])
        return 1`, { keys: [keys.queue, ready, `wa:inbox:${input.phone}:seen:${input.id}`], arguments: [JSON.stringify({ input, generation: await generation(this.app.redis, input.phone) }), input.phone] });
    }
    // Busy conversations are already durably queued, so their webhook can ACK
    // without requiring provider retries. The owner/recovery worker drains them.
    await Promise.all([...new Set(messages.map(m => m.phone))].map(phone => this.drain(phone)));
  }

  async drain(phone: string) {
    const keys = inboxKeys(phone), token = crypto.randomUUID();
    if (!await this.app.redis.set(keys.lock, token, { NX: true, EX: 180 })) return;
    try {
      for (let n = 0; n < 25; n++) {
        const owns = await this.app.redis.eval(`-- whatsapp-inbox-renew
          if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
          redis.call('EXPIRE', KEYS[1], 180) return 1`, { keys: [keys.lock], arguments: [token] });
        if (!owns) return;
        const raw = await this.app.redis.lIndex(keys.queue, 0);
        if (!raw) break;
        const message = JSON.parse(raw) as { input: Incoming; generation: number };
        if (message.generation === await generation(this.app.redis, phone)) await this.handle(message.input, true);
        // A crash after handle's transaction is harmless: its per-message
        // dedup marker makes reprocessing the retained head idempotent.
        await this.app.redis.eval(`-- whatsapp-inbox-ack
          if redis.call('GET', KEYS[2]) ~= ARGV[2] then return 0 end
          if redis.call('LINDEX', KEYS[1], 0) == ARGV[1] then redis.call('LPOP', KEYS[1]) return 1 end
          return 0`, { keys: [keys.queue, keys.lock], arguments: [raw, token] });
      }
      await this.app.redis.eval(`-- whatsapp-inbox-flush
        if redis.call('GET', KEYS[4]) ~= ARGV[2] or redis.call('LLEN', KEYS[1]) ~= 0 then return 0 end
        local reply = redis.call('GET', KEYS[3])
        if reply then
          for _,job in ipairs(cjson.decode(reply)) do redis.call('RPUSH', KEYS[5], job) end
          redis.call('DEL', KEYS[3])
        end
        redis.call('SREM', KEYS[2], ARGV[1])
        return 1`, { keys: [keys.queue, ready, keys.reply, keys.lock, "notifications:queue"], arguments: [phone, token] });
    } finally {
      await this.app.redis.eval(`-- whatsapp-inbox-release
        if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`, { keys: [keys.lock], arguments: [token] });
    }
  }

  async recover() {
    if (process.env.WHATSAPP_BOT_ENABLED !== "true") return;
    const phones = await this.app.redis.sMembers(ready);
    await Promise.all(phones.slice(0, 20).map(phone => this.drain(phone).catch(() => {
      this.app.log.warn("WhatsApp inbox processing deferred; retained for retry");
    })));
  }
}

export function startInboxRecovery(app: FastifyInstance, inbox: WhatsAppInbox) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  app.addHook("onReady", async () => {
    timer = setInterval(() => {
      if (running) return;
      running = true;
      void inbox.recover().catch(() => app.log.warn("WhatsApp inbox recovery unavailable")).finally(() => { running = false; });
    }, 5000);
    timer.unref();
  });
  app.addHook("onClose", async () => { if (timer) clearInterval(timer); });
}
