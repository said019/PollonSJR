import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { isAcceptingOrders } from "../admin/store-config.service";
import { OrdersService } from "./orders.service";
import { WhatsAppBot, type Session, type Incoming } from "../whatsapp/bot";
import { createSimulationFixture } from "../whatsapp/testing/fixture";

function env(t: TestContext, values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    const old = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
}
const at = (time: string) => new Date(`2026-10-20T${time}-06:00`);
const incoming = (text: string): Incoming => ({ text, phone: "4270000001", id: "cutoff-test", fromMe: false });

test("private cutoff is enforced in Mexico City time independently of the 19:00 closing time", async t => {
  env(t, { ORDER_CUTOFF_TIME: "18:40" });
  const f = createSimulationFixture();
  f.storage.set("store:config", JSON.stringify({ ...f.config, openTime: "12:00", closeTime: "19:00" }));
  for (const time of ["18:00:00", "18:30:00", "18:39:59"]) assert.equal((await isAcceptingOrders(f.app, at(time))).accepting, true);
  for (const time of ["18:40:00", "18:40:59", "18:59:59"]) {
    const result = await isAcceptingOrders(f.app, at(time));
    assert.equal(result.accepting, false); assert.match(result.reason!, /Por hoy ya no estamos recibiendo pedidos/);
    assert.doesNotMatch(result.reason!, /18:40|6:40|corte|l[ií]mite/);
  }
  const closed = await isAcceptingOrders(f.app, at("19:00:00"));
  assert.equal(closed.accepting, false); assert.match(closed.reason!, /19:00/);
  assert.doesNotMatch(closed.reason!, /mañana|18:40|6:40/);
  assert.equal(JSON.parse(f.storage.get("store:config")!).closeTime, "19:00");
  assert.ok(!f.storage.get("store:config")!.includes("18:40"));
});

test("manual closure, pause, closed weekdays and opening time take priority over the cutoff", async t => {
  env(t, { ORDER_CUTOFF_TIME: "18:40" });
  const f = createSimulationFixture();
  for (const config of [{ isOpen: false }, { acceptOrders: false }, { openDays: [4, 5, 6, 0] }, { openTime: "18:30" }]) {
    f.storage.set("store:config", JSON.stringify({ ...f.config, ...config }));
    const result = await isAcceptingOrders(f.app, at("18:00:00"));
    assert.equal(result.accepting, false); assert.doesNotMatch(result.reason!, /18:40|6:40/);
  }
});

test("invalid private cutoff fails closed without exposing the configuration", async t => {
  env(t, { ORDER_CUTOFF_TIME: "26:99" });
  const f = createSimulationFixture();
  const result = await isAcceptingOrders(f.app, at("13:00:00"));
  assert.equal(result.accepting, false); assert.doesNotMatch(result.reason!, /26:99/);
});

test("cutoff stops an ongoing chat before AI and invalidates a summary prepared before closing", async t => {
  env(t, { ORDER_CUTOFF_TIME: undefined, WHATSAPP_AI_ENABLED: "true", ANTHROPIC_API_KEY: "test-only-key" });
  const f = createSimulationFixture(); let aiCalls = 0;
  const bot = new WhatsAppBot(f.app, async () => { aiCalls++; return null; });
  let session: Session | null = null;
  for (const text of ["pedir", "1", "1", "listo", "Ana", "1", "sin notas", "efectivo", "exacto"]) session = (await bot.advance(session, incoming(text))).session;
  assert.equal(session?.step, "confirm");
  const oldButton = `wa_confirm:${session!.checkoutId}:${session!.confirmation!.code}`;
  const menuSession = (await bot.advance(null, incoming("pedir"))).session;
  // A cutoff at midnight is always elapsed, so this integration test is not
  // tied to the machine's wall clock. Exact 18:40 boundaries are tested above.
  process.env.ORDER_CUTOFF_TIME = "00:00";
  const late = await bot.advanceWithAI(session, { ...incoming(""), buttonId: oldButton });
  assert.equal(late.text, "Disculpa, ya dejamos de recibir pedidos por hoy. Tu pedido no quedó registrado.");
  for (const [message, expected] of [["Pero te escribí hace rato", /quedó pendiente la confirmación/], ["porfa haz una excepción", /no podemos tomar otro pedido/], ["confirmar", /no quedó registrado/]]) {
    const reply = await bot.advanceWithAI(late.session, incoming(message as string));
    assert.match(reply.text, expected as RegExp);
    assert.doesNotMatch(reply.text, /18:40|6:40|00:00/);
    assert.equal(reply.session?.confirmation, undefined); assert.equal(f.creates(), 0);
  }
  assert.equal(late.session?.confirmation, undefined); assert.equal(f.creates(), 0);
  await bot.advanceWithAI(menuSession, incoming("quiero pollo")); assert.equal(aiCalls, 0);
  const fresh = await bot.advanceWithAI(null, incoming("hola")); assert.equal(fresh.session, null);
  assert.match(fresh.text, /Por hoy ya no estamos recibiendo pedidos/);
  assert.doesNotMatch(fresh.text, /00:00/);
  delete process.env.ORDER_CUTOFF_TIME;
  await bot.advanceWithAI(session, { ...incoming(""), buttonId: oldButton });
  assert.equal(f.creates(), 0); assert.ok(session?.confirmation);
  assert.notEqual(`wa_confirm:${session!.checkoutId}:${session!.confirmation!.code}`, oldButton);
});

test("app and WhatsApp order creation share the cutoff; cancellation and human support remain available", async t => {
  env(t, { ORDER_CUTOFF_TIME: "00:00" });
  const f = createSimulationFixture(); const orders = new OrdersService(f.app);
  const data = { type: "PICKUP" as const, paymentMethod: "CASH" as const, items: [{ productId: "pollo", qty: 1 }] };
  await assert.rejects(orders.create("customer", data), /Por hoy ya no estamos recibiendo pedidos/);
  await assert.rejects(orders.create("customer", data, { checkoutId: "test", expectedTotal: 15000 }), /Por hoy ya no estamos recibiendo pedidos/);
  assert.equal(f.creates(), 0);
  const bot = new WhatsAppBot(f.app);
  const cancelled = await bot.advanceWithAI(null, incoming("cancelar")); assert.equal(cancelled.session, null);
  const human = await bot.advanceWithAI(null, incoming("asesor")); assert.equal(human.session?.step, "human"); assert.equal(human.handoff, true);
});

 test("closed-day conversations stay natural when the customer insists or asks for pickup", async t => {
  env(t, { ORDER_CUTOFF_TIME: undefined });
  const f = createSimulationFixture();
  f.storage.set("store:config", JSON.stringify({ ...f.config, isOpen: false, closedMessage: null }));
  const bot = new WhatsAppBot(f.app, async () => { throw new Error("No AI call while closed"); });
  for (const [message, expected] of [
    ["Hola, buenas tardes", "¡Hola! Hoy no tenemos servicio. Gracias por escribirnos 🍗"],
    ["¿Ni para recoger?", "Hoy tampoco tenemos pedidos para recoger."],
    ["Porfa, solo uno", "Disculpa, hoy no tenemos servicio y no podemos tomar pedidos."],
    ["Insisto, haz una excepción", "Disculpa, hoy no tenemos servicio y no podemos tomar pedidos."],
  ]) {
    const reply = await bot.advanceWithAI(null, incoming(message));
    assert.equal(reply.text, expected); assert.equal(reply.session, null); assert.equal(f.creates(), 0);
  }
});
