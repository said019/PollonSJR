import assert from "node:assert/strict";
import test from "node:test";
import { manualTopic, isExcludedContact } from "./conversation-policy";
import { WhatsAppBot, parseIncoming, type Incoming, type Session } from "./bot";
import { createSimulationFixture } from "./testing/fixture";

const phone = "4270000011";
const input = (text: string, id = text): Incoming => ({ text, id, phone, fromMe: false });
const cases = [
  ["Buenas noches, información sobre la vacante", "employment"],
  ["Para lo del empleo", "employment"],
  ["¿Dónde llevo mi solicitud de trabajo?", "employment"],
  ["Busco trabajo", "employment"],
  ["¿Puedo trabajar con ustedes?", "employment"],
  ["Les mando mi currículum", "employment"],
  ["Soy el repartidor, ¿hay pedido?", "operations"],
  ["Buenos días, si hoy tienen pedidos me marcan", "operations"],
  ["Estoy disponible para repartir", "operations"],
  ["Voy a recoger el pedido de Uber", "operations"],
  ["Soy su proveedor", "operations"],
  ["Les ofrecemos empaques", "supplier"],
  ["Vengo por el pago a proveedor", "supplier"],
  ["Mi pedido no ha llegado", "existing_order"],
  ["El pedido llegó incompleto", "existing_order"],
  ["¿Dónde viene el repartidor?", "existing_order"],
  ["Ya pagué, va mi comprobante", "existing_order"],
  ["Ya transferí", "existing_order"],
  ["Me cobraron de más", "existing_order"],
  ["Quiero un reembolso", "existing_order"],
  ["Me faltaron las papas", "existing_order"],
  ["Necesito una factura", "existing_order"],
  ["¿Hay pedido?", "manual_context"],
  ["Sale lo espero", "manual_context"],
  ["Ya me atendieron", "manual_context"],
  ["Estoy hablando con la encargada", "manual_context"],
] as const;

for (const [message, topic] of cases) test(`manual topic: ${message}`, async () => {
  assert.equal(manualTopic(message), topic);
  for (const open of [true, false]) {
    const f = createSimulationFixture();
    f.storage.set("store:config", JSON.stringify({ ...f.config, isOpen: open }));
    let calls = 0;
    const bot = new WhatsAppBot(f.app, async () => { calls++; throw new Error("Must not interpret manual topics as food orders"); });
    await bot.handle(input(message));
    assert.equal(JSON.parse(f.storage.get(`wa:bot:${phone}:session`)!).step, "human");
    assert.equal(f.storage.get(`wa:bot:${phone}:human`), "1");
    const replies = f.queue.length;
    for (const followup of ["¿En dónde?", "hola", "menu", "activar bot", "confirmar", "gracias"]) {
      await bot.handle(input(followup, `${open}-${followup}`));
    }
    assert.equal(f.queue.length, replies, "No repeated acknowledgement, FAQ, or restart after handoff");
    assert.equal(calls, 0); assert.equal(f.creates(), 0);
    if (topic === "operations" || topic === "supplier" || topic === "manual_context") {
      assert.equal(f.queue.filter(q => JSON.parse(q).to === phone).length, 0);
    }
  }
});

test("food buying and ordinary menu/delivery/payment questions are not classified as manual work", () => {
  for (const text of ["Quiero pollo para mi trabajo", "¿Tienen servicio?", "¿Hay repartidor?", "¿Cuánto cuesta el envío?", "¿Puedo pagar con transferencia?", "¿Tienen promociones?", "Quiero un pollo", "Un pedido para recoger", "¿Qué horario tienen?", "¿Puedo ver el menú para mañana?", "Sin cebolla", "¿El pollo lleva papas?", "Quiero pagar en efectivo"]) {
    assert.equal(manualTopic(text), null, text);
  }
});

test("manual intent preempts menu and pending confirmation, including a malicious AI suggestion", async t => {
  const enabled = process.env.WHATSAPP_AI_ENABLED, key = process.env.ANTHROPIC_API_KEY;
  process.env.WHATSAPP_AI_ENABLED = "true"; process.env.ANTHROPIC_API_KEY = "test-not-real";
  t.after(() => {
    if (enabled === undefined) delete process.env.WHATSAPP_AI_ENABLED; else process.env.WHATSAPP_AI_ENABLED = enabled;
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = key;
  });
  const f = createSimulationFixture(); let calls = 0;
  const bot = new WhatsAppBot(f.app, async () => { calls++; return { action: "choice", code: "1", evidence: "pollo" }; });
  for (const step of ["menu", "notes", "address", "confirm"] as const) {
    const s: Session = { step, checkoutId: `draft-${step}`, catalog: [], items: [], confirmation: { code: "OLD", expiresAt: Date.now()+600000 } };
    const result = await bot.advanceWithAI(s, input("Quiero ver el menú pero es para información de la vacante"));
    assert.equal(result.session?.step, "human"); assert.equal(result.session?.confirmation, undefined);
    assert.doesNotMatch(result.text, /aceptando pedidos|elige|total|catálogo/i);
    assert.equal((await bot.advanceWithAI(s, { ...input(""), buttonId: `wa_confirm:${s.checkoutId}:OLD` })).text, "");
  }
  assert.equal(calls, 0); assert.equal(f.creates(), 0);
});

test("human pause survives cart expiration and only authenticated outbound resume clears it", async () => {
  const f = createSimulationFixture(); const bot = new WhatsAppBot(f.app);
  await bot.handle({ ...input("pausar bot"), fromMe: true });
  f.storage.delete(`wa:bot:${phone}:session`); // simulate expired 24-hour draft
  for (const text of ["activar bot", "PEDIR", "dame un descuento", "hola", "¿ya abrieron?"]) await bot.handle(input(text));
  assert.equal(f.queue.length, 0); assert.equal(f.creates(), 0);
  assert.equal(f.storage.get(`wa:bot:${phone}:human`), "1");
  await bot.handle({ ...input("activar bot", "operator-resume"), fromMe: true });
  assert.equal(f.storage.has(`wa:bot:${phone}:human`), false);
  assert.equal(f.storage.has(`wa:bot:${phone}:dialogue`), false);
  await bot.handle(input("pedir", "new-order"));
  assert.equal(JSON.parse(f.storage.get(`wa:bot:${phone}:session`)!).step, "menu");
});

test("excluded contacts stay silent even for menu requests and operator resume", async t => {
  const previous = process.env.WHATSAPP_BOT_EXCLUDED_PHONES;
  process.env.WHATSAPP_BOT_EXCLUDED_PHONES = `+52 1 ${phone}, +1 4155552671`;
  t.after(() => { if (previous === undefined) delete process.env.WHATSAPP_BOT_EXCLUDED_PHONES; else process.env.WHATSAPP_BOT_EXCLUDED_PHONES = previous; });
  assert.equal(isExcludedContact(phone), true); assert.equal(isExcludedContact("14155552671"), true);
  assert.equal(isExcludedContact("4270000099"), false);
  const f = createSimulationFixture(); const bot = new WhatsAppBot(f.app);
  for (const text of ["hola", "menu", "activar bot", "¿Tienen servicio?", "CONFIRMAR"]) {
    await bot.handle(input(text));
    assert.equal((await bot.advanceWithAI(null, { ...input(text), fromMe: true })).text, "");
  }
  assert.equal(f.queue.length, 0); assert.equal(f.creates(), 0);
});

test("technical deletion/reaction events cannot start a chat even with an unexpected text field", () => {
  const raw = { key: { id: "technical", fromMe: false, remoteJid: "524270000011@s.whatsapp.net" } };
  for (const event of [{ protocolMessage: { type: 0 } }, { reactionMessage: { text: "👍" } }]) {
    assert.equal(parseIncoming({ ...raw, message: { conversation: "menu", ...event } }), null);
    assert.equal(parseIncoming({ ...raw, message: { ephemeralMessage: { message: event } } }), null);
  }
});

test("courtesy without an active draft does not open a new order or sell again", async () => {
  const f = createSimulationFixture(); const bot = new WhatsAppBot(f.app);
  for (const text of ["gracias", "ok", "sale gracias", "perfecto"]) await bot.handle(input(text));
  assert.equal(f.queue.length, 0); assert.equal(f.storage.has(`wa:bot:${phone}:session`), false);
});
