import type { RedisClientType } from "redis";
import { normalizarTelefono, soloDigitos } from "../../utils/phone";
const canonical = (phone: string) => normalizarTelefono(phone) ?? soloDigitos(phone);

export const attentionKeys = (phone: string) => ({
  human: `wa:bot:${canonical(phone)}:human`,
  unknown: `wa:bot:${canonical(phone)}:outbound-unknown`,
  sending: `wa:bot:${canonical(phone)}:sending`,
  generation: `wa:bot:${canonical(phone)}:generation`,
});
const knownKey = (phone: string, id: string) => `wa:outbound:${canonical(phone)}:app:${id}`;

// Both event-first and response-first orderings are atomic. Content, source
// labels and timestamps are NOT evidence that a message came from this app.
export async function observeOutbound(redis: RedisClientType, phone: string, id: string): Promise<"app" | "new" | "duplicate"> {
  const result = Number(await redis.eval(`-- observe-app-outbound
    if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
    if not redis.call('SET', KEYS[2], '1', 'NX', 'EX', 604800) then return -1 end
    redis.call('SADD', KEYS[3], ARGV[1])
    return 1`, {
    keys: [knownKey(phone, id), `wa:outbound:${canonical(phone)}:seen:${id}`, attentionKeys(phone).unknown], arguments: [id],
  }));
  return result === 0 ? "app" : result === 1 ? "new" : "duplicate";
}

export async function recordAppOutbound(redis: RedisClientType, phone: string, id: string) {
  await redis.multi().set(knownKey(phone, id), "1", { EX: 604800 })
    .sRem(attentionKeys(phone).unknown, id).exec();
}

export async function attentionState(redis: RedisClientType, phone: string): Promise<"automatic" | "human" | "pending"> {
  const keys = attentionKeys(phone);
  // Read a single Redis snapshot: separate GET/SCARD/GET calls could see
  // an echo before acknowledgement and its lease after release, inventing
  // a human takeover from an app-only send.
  const state = Number(await redis.eval(`-- attention-state
    if redis.call('EXISTS', KEYS[1]) == 1 then return 1 end
    if redis.call('SCARD', KEYS[2]) == 0 then return 0 end
    if redis.call('EXISTS', KEYS[3]) == 1 then return 2 end
    return 1`, { keys: [keys.human, keys.unknown, keys.sending], arguments: [] }));
  return state === 0 ? "automatic" : state === 2 ? "pending" : "human";
}

export async function generation(redis: RedisClientType, phone: string) {
  return Number(await redis.get(attentionKeys(phone).generation) || 0);
}

// An early echo must not consume a customer's next message while the HTTP
// sender is still learning its ID. Both provider requests have 12s timeouts.
export async function settledAttentionState(redis: RedisClientType, phone: string, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let state = await attentionState(redis, phone);
  while (state === "pending" && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
    state = await attentionState(redis, phone);
  }
  if (state === "pending") throw new Error("Outbound identification pending; retry operation");
  return state;
}
