/** Isolated real Redis regression. Unix socket only; no production env/clients. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, access, rm } from "node:fs/promises";
import { createClient } from "redis";
import { attentionKeys, attentionState, observeOutbound, recordAppOutbound } from "../attention";

async function main() {
  const dir = await mkdtemp("/tmp/pollon-attention-");
  const socket = `${dir}/redis.sock`;
  const server = spawn("redis-server", ["--port", "0", "--unixsocket", socket, "--unixsocketperm", "700", "--save", "", "--appendonly", "no"], { stdio: "ignore" });
  let startupError: Error | undefined; server.on("error", error => { startupError = error; });
  const closed = new Promise<void>(resolve => { server.once("exit", () => resolve()); server.once("error", () => resolve()); });
  const clients = [createClient({ socket: { path: socket, reconnectStrategy: false } }), createClient({ socket: { path: socket, reconnectStrategy: false } })];
  clients.forEach(client => client.on("error", () => {}));
  try {
    for (let attempt = 0; ; attempt++) {
      if (startupError) throw startupError;
      try { await access(socket); break; } catch { if (attempt >= 100) throw new Error("Isolated Redis did not start"); }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await Promise.all(clients.map(client => client.connect()));
    const [sender, webhook] = clients;
    for (let n = 0; n < 100; n++) {
      const phone = `42700${String(n).padStart(5, "0")}`;
      const id = `own-${n}`;
      await sender.set(attentionKeys(phone).sending, "synthetic-lease", { EX: 60 });
      const work = [() => observeOutbound(webhook as any, phone, id), () => recordAppOutbound(sender as any, phone, id)];
      if (n % 2) work.reverse();
      await Promise.all([...work.map(run => run()), (async () => {
        for (let sample = 0; sample < 10; sample++) assert.notEqual(await attentionState(sender as any, phone), "human");
      })()]);
      await sender.del(attentionKeys(phone).sending);
      assert.equal(await attentionState(sender as any, phone), "automatic");
      assert.equal(await observeOutbound(webhook as any, phone, id), "app");
    }
    for (let n = 0; n < 50; n++) {
      const phone = `42701${String(n).padStart(5, "0")}`;
      await sender.set(attentionKeys(phone).sending, "synthetic-lease", { EX: 60 });
      await Promise.all([
        observeOutbound(webhook as any, phone, `own-${n}`),
        observeOutbound(webhook as any, phone, `staff-${n}`),
        recordAppOutbound(sender as any, phone, `own-${n}`),
      ]);
      assert.equal(await attentionState(sender as any, phone), "pending");
      await sender.del(attentionKeys(phone).sending);
      assert.equal(await attentionState(sender as any, phone), "human");
      assert.deepEqual(await sender.sMembers(attentionKeys(phone).unknown), [`staff-${n}`]);
      assert.equal(await sender.ttl(attentionKeys(phone).unknown), -1, "manual hold must not expire");
      assert.equal(await observeOutbound(webhook as any, phone, `staff-${n}`), "duplicate");
    }
    // Different MX representations resolve to the same known outbound ID.
    await recordAppOutbound(sender as any, "5214270000099", "normalized");
    assert.equal(await observeOutbound(webhook as any, "4270000099", "normalized"), "app");
    console.log(JSON.stringify({ isolatedRedis: true, concurrentScenarios: 150, passed: 150, failed: 0, productionConnections: 0, realMessages: 0 }));
  } finally {
    await Promise.all(clients.map(async client => { if (client.isOpen) await client.quit(); }));
    server.kill("SIGTERM"); await closed; await rm(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
