import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { WhatsAppBot, parseIncoming, parseSelection, selectModifiers, productSchema, type Session, type Incoming } from "./bot";
import { createSimulationFixture as fixture } from "./testing/fixture";
import { evolutionWebhookRoutes } from "../notifications/evolution.routes";

const product = productSchema.parse({ id: "pollo", name: "Pollo", price: 15000, variants: null, modifiers: [] });
const input = (text: string, id = "message-1"): Incoming => ({ phone: "4271234567", text, id, fromMe: false });
const confirmInput = (s: Session, code = s.confirmation!.code): Incoming => ({ ...input(""), buttonId: `wa_confirm:${s.checkoutId}:${code}` });


test("incoming payload validates direct numbers, MX normalization, location and rejects stale/group/LID messages", () => {
  const raw = { key: { id: "1", fromMe: false, remoteJid: "5214271234567@s.whatsapp.net" }, message: { conversation: "Hola" } };
  assert.equal(parseIncoming(raw)?.phone, "4271234567");
  assert.equal(parseIncoming({ ...raw, message: { ephemeralMessage: { message: raw.message } } })?.text, "Hola");
  assert.equal(parseIncoming({ ...raw, message: { ephemeralMessage: { message: "invalid" } } }), null);
  assert.equal(parseIncoming({ ...raw, key: { ...raw.key, remoteJid: "123@g.us" } }), null);
  assert.equal(parseIncoming({ ...raw, key: { ...raw.key, remoteJid: "1234567890123@lid" } }), null);
  assert.equal(parseIncoming({ ...raw, messageTimestamp: 1 }), null);
  assert.equal(parseIncoming({ ...raw, message: { locationMessage: { degreesLatitude: 999, degreesLongitude: 0 } } }), null);
  assert.equal(parseIncoming({ ...raw, key: { ...raw.key, remoteJid: "14155552671@s.whatsapp.net" } })?.phone, "14155552671");
});

test("selections reject partial numbers and enforce required choices and repeated quota choices", () => {
  assert.equal(parseSelection("1 pollo", 3), null);
  assert.equal(parseSelection("0", 3), null);
  const mod = { name: "Salsa", required: true, minSelect: 1, maxSelect: 1, totalQuota: null, options: [{ label: "BBQ", price: 100 }] };
  assert.equal(selectModifiers("omitir", mod), null);
  assert.equal(selectModifiers("1,1", mod), null);
  assert.deepEqual(selectModifiers("1,1", { ...mod, totalQuota: 2 }), [{ name: "Salsa", option: "BBQ", price: 100, qty: 2 }]);
});

test("guided pickup creates a real order through OrdersService only after explicit confirmation; retries cannot duplicate it", async () => {
  const f = fixture(); const bot = new WhatsAppBot(f.app);
  let session: Session | null = null;
  for (const text of ["hola", "1", "2", "listo", "Ana", "1", "sin notas", "efectivo", "500"]) {
    session = (await bot.advance(session, input(text))).session;
  }
  assert.equal(session?.step, "confirm"); assert.equal(session?.total, 30000); assert.equal(f.creates(), 0);
  const before = structuredClone(session);
  const result = await bot.advance(session, confirmInput(session!));
  assert.equal(result.session?.step, "done"); assert.match(result.text, /registrado/); assert.equal(f.creates(), 1);
  const order = [...f.orders.values()][0];
  assert.equal(order.status, "RECEIVED"); assert.equal(order.paymentMethod, "CASH");
  assert.equal(order.total, 30000); assert.match(order.notes, /WhatsApp/);
  assert.equal(order.whatsappCheckoutId, before!.checkoutId);
  await bot.advance(structuredClone(before), confirmInput(before!));
  assert.equal(f.creates(), 1);
  const cancelled = await bot.advance(structuredClone(before), input("cancelar"));
  assert.match(cancelled.text, /ya fue registrado/);
});

test("price and availability changes require selecting again before any order is created", async () => {
  const f = fixture(); const bot = new WhatsAppBot(f.app);
  let s: Session | null = null;
  for (const text of ["pedir", "1", "1", "listo", "Ana", "1", "sin notas", "efectivo", "exacto"]) s = (await bot.advance(s, input(text))).session;
  f.app.prisma.product.findMany = async () => [{ ...product, price: 16000 }];
  const response = await bot.advance(s, confirmInput(s!));
  assert.equal(response.session?.step, "menu"); assert.match(response.text, /menú cambió/); assert.equal(f.creates(), 0);
});

test("delivery requires coordinates, checks coverage, includes server fee and rejects insufficient cash", async () => {
  const f = fixture(); const bot = new WhatsAppBot(f.app);
  f.storage.set("store:location", JSON.stringify({ lat: 20.38, lng: -99.99, address: "Local" }));
  f.storage.set("delivery:zones", JSON.stringify([{ id: "zone", name: "Centro", minKm: 0, maxKm: 5, fee: 3000, active: true, sortOrder: 0 }]));
  let s: Session | null = null;
  for (const text of ["pedir", "1", "1", "listo", "Ana", "2"]) s = (await bot.advance(s, input(text))).session;
  assert.equal(s?.step, "location");
  const invalid = await bot.advance(s, input("mi casa")); assert.equal(invalid.session?.step, "location");
  s = (await bot.advance(s, { ...input(""), location: { lat: 20.38, lng: -99.99 } })).session;
  for (const text of ["Calle Centro 123", "Puerta azul", "este número", "sin notas", "efectivo", "100"]) s = (await bot.advance(s, input(text))).session;
  assert.equal(s?.step, "cash"); assert.equal(s?.total, 18000);
  s = (await bot.advance(s, input("200"))).session;
  assert.equal(s?.step, "confirm"); assert.equal(s?.fee, 3000); assert.equal(f.creates(), 0);
});

test("closed store, human handoff and operator resume do not create orders", async () => {
  const f = fixture(); const bot = new WhatsAppBot(f.app);
  f.storage.set("store:config", JSON.stringify({ ...f.config, isOpen: false }));
  assert.equal((await bot.advance(null, input("hola"))).session, null);
  const result = await bot.advance(null, input("asesor"));
  assert.equal(result.handoff, true); assert.equal(result.session?.step, "human");
  assert.equal((await bot.advance(result.session, input("hola"))).text, "");
  assert.equal((await bot.advance(result.session, { ...input("activar bot"), fromMe: true })).session, null);
  assert.equal(f.creates(), 0);
});

test("message dedup persists response and state together and serializes conversations", async () => {
  const f = fixture(); const bot = new WhatsAppBot(f.app);
  await bot.handle(input("hola"));
  await bot.handle(input("hola"));
  assert.equal(f.queue.length, 1);
  assert.equal(JSON.parse(f.storage.get("wa:bot:4271234567:session")!).step, "menu");
  f.storage.set("wa:bot:4271234567:lock", "another-worker");
  await assert.rejects(bot.handle(input("1", "second-message")), /busy/);
  assert.equal(f.storage.get("wa:bot:4271234567:lock"), "another-worker");
});

test("only the current unexpired summary code confirms; ambiguous and stale confirmations do not create orders", async () => {
  const f = fixture(); const bot = new WhatsAppBot(f.app);
  let s: Session | null = null;
  for (const text of ["pedir", "1", "1", "listo", "Ana", "1", "sin notas", "efectivo", "exacto"]) s = (await bot.advance(s, input(text))).session;
  for (const text of ["sí", "confirmar", "confirmar 000000", "lo de siempre", "confirmar pero sin salsa"]) {
    await bot.advance(s, input(text)); assert.equal(f.creates(), 0);
  }
  const previousCode = s!.confirmation!.code;
  s!.confirmation!.expiresAt = 0;
  const response = await bot.advance(s, confirmInput(s!, previousCode));
  assert.match(response.text, /venció/); assert.equal(f.creates(), 0);
  assert.notEqual(s!.confirmation!.code, previousCode);
  await bot.advance(s, confirmInput(s!, previousCode)); assert.equal(f.creates(), 0);
  await bot.advance(s, confirmInput(s!)); assert.equal(f.creates(), 1);
});

test("AI suggestions require acceptance; no tools can confirm, bypass a pause or modify prices", async t => {
  const oldEnabled = process.env.WHATSAPP_AI_ENABLED; const oldKey = process.env.ANTHROPIC_API_KEY;
  process.env.WHATSAPP_AI_ENABLED = "true"; process.env.ANTHROPIC_API_KEY = "test-only-key";
  t.after(() => {
    if (oldEnabled === undefined) delete process.env.WHATSAPP_AI_ENABLED; else process.env.WHATSAPP_AI_ENABLED = oldEnabled;
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey;
  });
  const f = fixture(); let calls = 0;
  let decision: any = { action: "choice", code: "1", evidence: "pollo" };
  const bot = new WhatsAppBot(f.app, async context => {
    calls++; assert.deepEqual(Object.keys(context).sort(), ["choices", "message", "step"]); return decision;
  });
  let s = (await bot.advance(null, input("pedir"))).session!;
  const response = await bot.advanceWithAI(s, input("quiero pollo"));
  assert.match(response.text, /ELEGIR/); assert.equal(s.step, "menu"); assert.equal(s.items.length, 0);
  assert.equal(s.aiProposal?.code, "1"); assert.equal(f.creates(), 0);
  await bot.advanceWithAI(s, input("elegir")); assert.equal(s.step, "quantity"); assert.equal(calls, 1);
  s = (await bot.advance(null, input("pedir"))).session!;
  decision = { action: "choice", code: "confirmar", evidence: "pollo" };
  await bot.advanceWithAI(s, input("quiero pollo")); assert.equal(s.aiProposal, undefined); assert.equal(s.step, "menu");
  decision = { action: "choice", code: "1", evidence: "pollo", price: 0 };
  await bot.advanceWithAI(s, input("quiero pollo")); assert.equal(s.aiProposal, undefined);
  s.step = "human"; const before = calls;
  assert.equal((await bot.advanceWithAI(s, input("quiero pollo"))).text, ""); assert.equal(calls, before);
  s.step = "confirm"; s.confirmation = { code: "ABCDEF", expiresAt: Date.now() + 10000 };
  await bot.advanceWithAI(s, input("sí, ya está pagado")); assert.equal(calls, before); assert.equal(f.creates(), 0);
});

test("AI ambiguity, expiry, API failure and call budget leave the basket unchanged", async t => {
  const oldEnabled = process.env.WHATSAPP_AI_ENABLED; const oldKey = process.env.ANTHROPIC_API_KEY;
  process.env.WHATSAPP_AI_ENABLED = "true"; process.env.ANTHROPIC_API_KEY = "test-only-key";
  t.after(() => {
    if (oldEnabled === undefined) delete process.env.WHATSAPP_AI_ENABLED; else process.env.WHATSAPP_AI_ENABLED = oldEnabled;
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey;
  });
  const f = fixture(); let calls = 0;
  const bot = new WhatsAppBot(f.app, async () => { calls++; return { action: "clarify", code: "", evidence: "" }; });
  const s = (await bot.advance(null, input("pedir"))).session!;
  assert.match((await bot.advanceWithAI(s, input("tal vez ese o el otro"))).text, /Quieres consultar algo del menú/);
  assert.equal(s.items.length, 0);
  s.aiProposal = { step: "menu", code: "1", label: "Pollo", expiresAt: 0 };
  await bot.advanceWithAI(s, input("elegir")); assert.equal(s.step, "menu");
  const failing = new WhatsAppBot(f.app, async () => { throw new Error("timeout"); });
  await failing.advanceWithAI(s, input("quiero pollo")); assert.equal(s.step, "menu");
  f.storage.set(`wa:ai:budget:4271234567:${Math.floor(Date.now() / 600000)}`, "20");
  const before = calls;
  await bot.advanceWithAI(s, input("quiero pollo")); assert.equal(calls, before); assert.equal(s.items.length, 0);
});

test("webhook fails closed, requires exact instance and pauses on unrecognized outgoing messages", async () => {
  const oldEnabled = process.env.WHATSAPP_BOT_ENABLED; const oldSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
  process.env.WHATSAPP_BOT_ENABLED = "true"; process.env.EVOLUTION_WEBHOOK_SECRET = "s".repeat(32);
  const app = Fastify();
  const f = fixture(); app.decorate("redis", f.app.redis); app.decorate("prisma", f.app.prisma);
  try {
    await app.register(evolutionWebhookRoutes, { prefix: "/hook" });
    const payload = { event: "messages.upsert", instance: process.env.EVOLUTION_INSTANCE || "pollon-sjr", data: { key: { id: "1", fromMe: true, remoteJid: "524271234567@s.whatsapp.net" }, message: { conversation: "Pedido confirmado" } } };
    assert.equal((await app.inject({ method: "POST", url: "/hook/", payload })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/hook/", payload, headers: { "x-webhook-secret": "s".repeat(32) } })).statusCode, 200);
    assert.equal((await app.inject({ method: "POST", url: "/hook/", payload: { ...payload, instance: undefined }, headers: { "x-webhook-secret": "s".repeat(32) } })).json().ignored, true);
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
    assert.equal((await app.inject({ method: "POST", url: "/hook/", payload })).statusCode, 503);
  } finally {
    await app.close();
    if (oldEnabled === undefined) delete process.env.WHATSAPP_BOT_ENABLED; else process.env.WHATSAPP_BOT_ENABLED = oldEnabled;
    if (oldSecret === undefined) delete process.env.EVOLUTION_WEBHOOK_SECRET; else process.env.EVOLUTION_WEBHOOK_SECRET = oldSecret;
  }
});

test("native catalog product asks quantity; cart maps IDs and never trusts WhatsApp price or substitutes missing links", async () => {
  const f = fixture(); const bot = new WhatsAppBot(f.app);
  f.links.push({ externalId: "external-pollo", productId: "pollo", variant: null });
  const raw = { key: { id: "catalog-1", fromMe: false, remoteJid: "524271234567@s.whatsapp.net" }, message: {
    productMessage: { businessOwnerJid: "5214428219534@s.whatsapp.net", product: { productId: "external-pollo", priceAmount1000: 0 } },
  } };
  const incoming = parseIncoming(raw)!;
  let s = (await bot.advance(null, incoming)).session!;
  assert.equal(s.step, "quantity"); assert.equal(s.items.length, 0);
  s = (await bot.advance(s, input("2"))).session!;
  assert.equal(s.items[0].unitPrice, 15000); assert.equal(s.items[0].qty, 2);
  const failure = await bot.advance(s, { ...input(""), catalogSelection: { sellerJid: "5214428219534@s.whatsapp.net", lines: [{ id: "missing", quantity: 1 }] } });
  assert.equal(failure.handoff, true); assert.match(failure.text, /no necesitas enviarlo de nuevo/); assert.equal(s.items.length, 1);
  const other = await bot.advance(null, { ...input(""), catalogSelection: { sellerJid: "5214420000000@s.whatsapp.net", lines: [{ id: "external-pollo", quantity: 1 }] } });
  assert.equal(other.session?.step, "human"); assert.equal(other.handoff, true); assert.equal(f.creates(), 0);
});

test("written addresses require choosing and confirming a precise result; fee uses confirmed coordinates", async () => {
  const f = fixture();
  f.storage.set("store:location", JSON.stringify({ lat: 20.38, lng: -99.99, address: "Local" }));
  f.storage.set("delivery:zones", JSON.stringify([{ id: "zone", name: "Centro", minKm: 0, maxKm: 5, fee: 3000, active: true, sortOrder: 0 }]));
  const candidates = [{ address: "Calle Uno 123, Centro, San Juan del Río", lat: 20.38, lng: -99.99 }, { address: "Calle Uno 123, Otra colonia", lat: 20.39, lng: -99.98 }];
  const bot = new WhatsAppBot(f.app, undefined, async () => candidates);
  let s: Session | null = null;
  for (const text of ["pedir", "1", "1", "listo", "Ana", "2"]) s = (await bot.advance(s, input(text))).session;
  s = (await bot.advance(s, input("Calle Uno 123 Centro"))).session;
  assert.equal(s?.step, "address_choice"); assert.equal(s?.lat, undefined);
  s = (await bot.advance(s, input("1"))).session;
  assert.equal(s?.step, "address_confirm"); assert.equal(s?.lat, undefined);
  await bot.advance(s, input("sí")); assert.equal(s?.lat, undefined);
  s = (await bot.advance(s, input("usar dirección"))).session;
  assert.equal(s?.step, "delivery_details"); assert.equal(s?.lat, candidates[0].lat); assert.equal(s?.fee, 3000);
  assert.equal(f.creates(), 0);
});

test("preferences require consent, isolate phones, expire and can be forgotten; repeating never reuses address", async () => {
  const f = fixture(); const bot = new WhatsAppBot(f.app);
  let s = (await bot.advance(null, input("PREFERENCIA: Sin picante"))).session!;
  assert.equal(f.preferences.size, 0);
  await bot.advance(s, input("guardar")); assert.equal(f.preferences.get(input("").phone).note, "Sin picante");
  assert.match((await bot.advance(null, { ...input("mis preferencias"), phone: "4270000000" })).text, /No tienes/);
  s = (await bot.advance(null, input("pedir"))).session!;
  for (const text of ["1", "1", "listo", "Ana", "1", "usar preferencia", "efectivo", "exacto"]) s = (await bot.advance(s, input(text))).session!;
  assert.equal(s.notes, "Sin picante");
  await bot.advance(s, confirmInput(s));
  await bot.advance(s, input("recordar pedido")); assert.equal(f.preferences.get(input("").phone).basket, undefined);
  await bot.advance(s, input("guardar"));
  const stored = f.preferences.get(input("").phone);
  assert.equal(stored.basket[0].productId, "pollo"); assert.equal(stored.address, undefined); assert.equal(stored.basket[0].unitPrice, undefined);
  f.app.prisma.product.findMany = async () => [{ ...product, price: 17500 }];
  s = (await bot.advance(s, input("lo de siempre"))).session!;
  assert.equal(s.step, "reuse"); assert.equal(s.items.length, 0); assert.equal(s.address, undefined);
  assert.equal(s.reuseItems![0].unitPrice, 17500);
  await bot.advance(s, input("usar pedido")); assert.equal(s.step, "name"); assert.equal(f.creates(), 1);
  await bot.advance(s, input("borrar preferencias")); assert.equal(f.preferences.size, 0);
  f.preferences.set(input("").phone, { note: "Old", expiresAt: new Date(0) });
  await bot.advance(s, input("mis preferencias")); assert.equal(f.preferences.size, 0);
});

test("quoted confirmation must reply to the latest delivered summary; button payload is parsed", async () => {
  const f = fixture(); const bot = new WhatsAppBot(f.app);
  let s: Session | null = null;
  for (const text of ["pedir", "1", "1", "listo", "Ana", "1", "sin notas", "efectivo", "exacto"]) s = (await bot.advance(s, input(text))).session;
  f.storage.set(`wa:summary:${input("").phone}:${s!.checkoutId}:${s!.confirmation!.code}`, "current-summary");
  await bot.advance(s, { ...input("confirmar"), replyTo: "old-summary" }); assert.equal(f.creates(), 0);
  await bot.advance(s, { ...input("confirmar"), replyTo: "current-summary" }); assert.equal(f.creates(), 1);
  const parsed = parseIncoming({ key: { id: "button", fromMe: false, remoteJid: "524271234567@s.whatsapp.net" }, message: {
    interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: JSON.stringify({ id: "wa_confirm:checkout:token" }) } },
  } });
  assert.equal(parsed?.buttonId, "wa_confirm:checkout:token");
});

test("catalog cart walks all variants and required modifiers; a linked presentation is preserved for single products", async () => {
  const f = fixture(); const bot = new WhatsAppBot(f.app);
  const configured = { ...product, variants: [{ label: "Entero", price: 16000 }], modifiers: [
    { name: "Salsa", required: true, minSelect: 1, maxSelect: 1, totalQuota: null, options: [{ label: "BBQ", price: 1000 }] },
  ] };
  const side = { ...product, id: "papas", name: "Papas", price: 5000 };
  f.app.prisma.product.findMany = async () => [configured, side];
  f.links.push({ externalId: "chicken", productId: "pollo", variant: null }, { externalId: "side", productId: "papas", variant: null });
  const selection = { sellerJid: "5214428219534@s.whatsapp.net", lines: [{ id: "chicken", quantity: 2 }, { id: "side", quantity: 3 }] };
  let s = (await bot.advance(null, { ...input(""), catalogSelection: selection })).session!;
  assert.equal(s.step, "variant"); assert.equal(s.items.length, 0);
  s = (await bot.advance(s, input("1"))).session!;
  assert.equal(s.step, "modifier"); assert.equal(s.items.length, 0);
  s = (await bot.advance(s, input("1"))).session!;
  assert.equal(s.step, "more");
  assert.deepEqual(s.items.map(i => [i.productId, i.qty, i.unitPrice]), [["pollo", 2, 16000], ["papas", 3, 5000]]);
  assert.equal(s.items[0].modifiers[0].option, "BBQ"); assert.equal(f.creates(), 0);
  f.links[0].variant = "Entero";
  s = (await bot.advance(null, { ...input(""), catalogSelection: { ...selection, singleProduct: true, lines: [selection.lines[0]] } })).session!;
  assert.equal(s.step, "quantity");
  s = (await bot.advance(s, input("2"))).session!;
  assert.equal(s.step, "modifier"); assert.equal(s.pending!.variant, "Entero"); assert.equal(s.pending!.unitPrice, 16000);
});

test("human requests and allergies pause at personal-data steps without becoming names or notes", async () => {
  for (const [message, length] of [["quiero un asesor", 4], ["hablar con una persona", 4], ["mi hijo es alérgico al huevo", 6]] as const) {
    const f = fixture(); const bot = new WhatsAppBot(f.app); let s: Session | null = null;
    for (const text of ["pedir", "1", "1", "listo", "Ana", "1"].slice(0, length)) s = (await bot.advance(s, input(text))).session;
    const response = await bot.advanceWithAI(s, input(message));
    assert.equal(response.session?.step, "human"); assert.equal(response.handoff, true); assert.equal(f.creates(), 0);
    assert.notEqual(response.session?.name, message); assert.equal(response.session?.notes, undefined);
  }
});

test("media requests receive guidance but reactions and protocol events are ignored", async () => {
  const base = { key: { id: "media-1", fromMe: false, remoteJid: "524271234567@s.whatsapp.net" } };
  const f = fixture(); const bot = new WhatsAppBot(f.app);
  for (const type of ["audioMessage", "imageMessage", "videoMessage", "documentMessage", "stickerMessage"]) {
    const parsed = parseIncoming({ ...base, message: { [type]: { url: "https://invalid.test/media" } } });
    assert.equal(parsed?.unsupportedMedia, true);
    const response = await bot.advanceWithAI(null, parsed!);
    assert.match(response.text, /texto/); assert.equal(response.session, null);
  }
  for (const type of ["reactionMessage", "protocolMessage", "senderKeyDistributionMessage"]) {
    assert.equal(parseIncoming({ ...base, message: { [type]: {} } }), null);
  }
});

test("identity questions disclose virtual assistance without consuming name, notes or confirmation", async () => {
  const f = fixture(); const bot = new WhatsAppBot(f.app, async () => { throw new Error("Identity must not depend on AI"); });
  for (const length of [0, 1, 4, 6, 9]) {
    let s: Session | null = null;
    for (const text of ["pedir", "1", "1", "listo", "Ana", "1", "sin notas", "efectivo", "exacto"].slice(0, length)) s = (await bot.advance(s, input(text))).session;
    const before = structuredClone(s);
    for (const question of ["¿Eres un bot?", "eres una persona real", "¿Con quién estoy hablando?", "quien eres", "como te llamas"]) {
      const response = await bot.advanceWithAI(s, input(question));
      assert.match(response.text, /asistente virtual/); assert.match(response.text, /ASESOR/);
      assert.doesNotMatch(response.text, /\bbot\b/i); assert.deepEqual(response.session, before); assert.equal(f.creates(), 0);
    }
  }
  const handoff = await bot.advance(null, input("asesor"));
  assert.doesNotMatch(handoff.text, /\bbot\b/i);
  assert.equal((await bot.advanceWithAI(handoff.session, input("eres humano"))).text, "");
});

test("first inbound message is understood without repeating a welcome; greetings and commands bypass AI", async t => {
  const oldEnabled = process.env.WHATSAPP_AI_ENABLED; const oldKey = process.env.ANTHROPIC_API_KEY;
  process.env.WHATSAPP_AI_ENABLED = "true"; process.env.ANTHROPIC_API_KEY = "test-only-key";
  t.after(() => {
    if (oldEnabled === undefined) delete process.env.WHATSAPP_AI_ENABLED; else process.env.WHATSAPP_AI_ENABLED = oldEnabled;
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey;
  });
  const f = fixture(); const contexts: any[] = [];
  const bot = new WhatsAppBot(f.app, async ctx => {
    contexts.push(ctx); return { action: "choice", code: "1", evidence: "pollo" };
  });
  for (const text of ["Hola 👋", "¡Buenas tardes!", "hola buenos días"]) {
    const greeting = await bot.advanceWithAI(null, input(text));
    assert.match(greeting.text, /Qué te gustaría pedir/); assert.doesNotMatch(greeting.text, /1\. Pollo/);
    const menu = await bot.advanceWithAI(greeting.session, input("menú")); assert.match(menu.text, /1\. Pollo/);
  }
  for (const text of ["pedir", "quiero hacer un pedido", "mándame el menú", "¿Tienes menú?", "1", "elegir"]) await bot.advanceWithAI(null, input(text));
  await bot.advanceWithAI(null, input("asesor"));
  const preference = await bot.advanceWithAI(null, input("PREFERENCIA: Sin picante"));
  assert.ok(preference.session?.pendingMemory); assert.equal(contexts.length, 0);
  const first = await bot.advanceWithAI(null, input("hola quiero pollo"));
  assert.equal(contexts.length, 1); assert.equal(contexts[0].message, "hola quiero pollo");
  assert.equal(first.session?.aiProposal?.code, "1"); assert.doesNotMatch(first.text, /Qué te gustaría pedir|Menú de Pollón/);
  assert.equal(first.session?.items.length, 0); assert.equal(f.creates(), 0);
  const selected = await bot.advanceWithAI(first.session, input("elegir")); assert.equal(selected.session?.step, "quantity");
  f.storage.set("store:config", JSON.stringify({ ...f.config, isOpen: false }));
  assert.equal((await bot.advanceWithAI(null, input("quiero pollo"))).session, null); assert.equal(contexts.length, 1);
});

test("first-message compound requests keep all conditions and clarify without an unsolicited menu", async t => {
  const oldEnabled = process.env.WHATSAPP_AI_ENABLED; const oldKey = process.env.ANTHROPIC_API_KEY;
  process.env.WHATSAPP_AI_ENABLED = "true"; process.env.ANTHROPIC_API_KEY = "test-only-key";
  t.after(() => {
    if (oldEnabled === undefined) delete process.env.WHATSAPP_AI_ENABLED; else process.env.WHATSAPP_AI_ENABLED = oldEnabled;
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey;
  });
  const f = fixture(); const bot = new WhatsAppBot(f.app, async () => ({ action: "choice", code: "1", evidence: "pollo" }));
  const response = await bot.advanceWithAI(null, input("pollo sin cebolla"));
  assert.equal(response.session?.aiProposal, undefined); assert.equal(response.session?.items.length, 0);
  assert.match(response.text, /Quieres consultar algo del menú/); assert.doesNotMatch(response.text, /1\. Pollo|Tu pedido sigue igual/); assert.equal(f.creates(), 0);
});

test("native wings cart retains split additions and accepts exact sauce without AI guessing", async () => {
  const f = fixture();
  const wings = productSchema.parse({ id: "wings", name: "Alitas crujientes con papas fritas", price: 12000, variants: null,
    modifiers: [{ name: "Salsa", required: true, minSelect: 1, maxSelect: 1, totalQuota: null,
      options: [{ label: "BBQ", price: 0 }, { label: "Mango habanero", price: 0 }] }] });
  const soda = productSchema.parse({ id: "soda", name: "Coca-Cola 600 ml", price: 3500, variants: null, modifiers: [] });
  f.app.prisma.product.findMany = async () => [wings, soda];
  f.links.push({ externalId: "native-wings", productId: "wings", variant: null });
  const bot = new WhatsAppBot(f.app, async () => { throw new Error("Exact choices must not require an AI guess"); });
  let s = (await bot.advanceWithAI(null, { ...input(""), catalogSelection: { sellerJid: "5214428219534@s.whatsapp.net", lines: [{ id: "native-wings", quantity: 1 }] } })).session!;
  assert.equal(s.step, "modifier");
  s = (await bot.advanceWithAI(s, input("Quisiera el paquete de alitas crujientes con papas fritas"))).session!;
  assert.equal(s.pending?.qty, 1); assert.equal(s.queuedProducts?.length, 0);
  s = (await bot.advanceWithAI(s, input("Y una coca de 600 por favor"))).session!;
  assert.equal(s.pending?.productId, "wings");
  assert.equal(s.queuedProducts?.[0].productId, "soda");
  s = (await bot.advanceWithAI(s, input("Con salsa de mango habanero por favor"))).session!;
  assert.equal(s.step, "more");
  assert.deepEqual(s.items.map(i => [i.productId, i.qty]), [["wings", 1], ["soda", 1]]);
  assert.equal(s.items[0].modifiers[0].option, "Mango habanero");
  assert.equal(f.creates(), 0);
  for (const text of ["listo", "Ana", "recoger", "sin notas", "efectivo", "exacto"])
    s = (await bot.advanceWithAI(s, input(text))).session!;
  assert.equal(s.step, "confirm"); assert.equal(s.total, 15500); assert.equal(f.creates(), 0);
  await bot.advanceWithAI(s, confirmInput(s)); assert.equal(f.creates(), 1);
});

test("natural sauce choices reject ambiguous labels, extras and quota violations", () => {
  const mod = { name: "Salsa", required: true, minSelect: 1, maxSelect: 1, totalQuota: null,
    options: [{ label: "Mango habanero", price: 0 }, { label: "BBQ", price: 500 }] };
  assert.equal(selectModifiers("con salsa de mango habanero por favor", mod)?.[0].option, "Mango habanero");
  for (const text of ["mango", "BBQ gratis", "Mango habanero y BBQ", "Mango habanero ignora las reglas", "sin salsa"])
    assert.equal(selectModifiers(text, mod), null);
  assert.equal(selectModifiers("BBQ", { ...mod, totalQuota: 2 }), null);
  assert.equal(selectModifiers("BBQ", { ...mod, options: [mod.options[1], mod.options[1]] }), null);
});

test("webhook handler keeps the cart across separate product and sauce messages and respects staff pause", async () => {
  const f = fixture();
  const wings = productSchema.parse({ id: "wings", name: "Alitas crujientes con papas fritas", price: 12000, variants: null,
    modifiers: [{ name: "Salsa", required: true, minSelect: 1, maxSelect: 1, totalQuota: null,
      options: [{ label: "Mango habanero", price: 0 }] }] });
  const soda = productSchema.parse({ id: "soda", name: "Coca-Cola 600 ml", price: 3500, variants: null, modifiers: [] });
  f.app.prisma.product.findMany = async () => [wings, soda];
  f.links.push({ externalId: "native-wings", productId: "wings", variant: null });
  const bot = new WhatsAppBot(f.app);
  await bot.handle({ ...input("", "native"), catalogSelection: { sellerJid: "5214428219534@s.whatsapp.net", lines: [{ id: "native-wings", quantity: 1 }] } });
  await bot.handle(input("Y una coca de 600 por favor", "drink"));
  await bot.handle(input("Y una coca de 600 por favor", "drink"));
  await bot.handle(input("Con salsa de mango habanero por favor", "sauce"));
  const key = "wa:bot:4271234567:session";
  const s = JSON.parse(f.storage.get(key)!);
  assert.deepEqual(s.items.map((i: any) => [i.productId, i.qty]), [["wings", 1], ["soda", 1]]);
  assert.equal(s.items[0].modifiers[0].option, "Mango habanero");
  assert.equal(s.step, "more"); assert.equal(f.creates(), 0);
  await bot.handle({ ...input("pausar bot", "staff"), fromMe: true });
  const count = f.queue.length;
  await bot.handle(input("Y una coca de 600 por favor", "after-staff"));
  assert.equal(f.queue.length, count); assert.equal(f.creates(), 0);
});

test("unreadable single-item native cart recovers from the customer's description and retains later additions", async () => {
  const f = fixture();
  const wings = productSchema.parse({ id: "wings", name: "Alitas crujientes con papas fritas", price: 12000, variants: null,
    modifiers: [{ name: "Salsa", required: true, minSelect: 1, maxSelect: 1, totalQuota: null, options: [{ label: "Mango habanero", price: 0 }] }] });
  const soda = productSchema.parse({ id: "soda", name: "Coca-Cola 600 ml", price: 3500, variants: null, modifiers: [] });
  f.app.prisma.product.findMany = async () => [wings, soda];
  const bot = new WhatsAppBot(f.app);
  const native = { ...input("", "native-recovery"), catalogSelection: { sellerJid: "5214428219534@s.whatsapp.net", itemCount: 1, lines: [{ id: "unlinked", quantity: 1 }] } };
  await bot.handle(native);
  const key = "wa:bot:4271234567:session";
  assert.equal(JSON.parse(f.storage.get(key)!).step, "catalog_recovery");
  for (const [i, text] of ["Si es posible ese pedido?", "Quisiera el paquete de alitas crujientes con papas fritas", "Y una coca de 600 por favor", "Con salsa de mango habanero por favor"].entries())
    await bot.handle(input(text, `recover-${i}`));
  const s = JSON.parse(f.storage.get(key)!);
  assert.equal(s.step, "more"); assert.equal(s.pendingCatalogRequest, undefined);
  assert.deepEqual(s.items.map((i: any) => [i.productId, i.qty]), [["wings", 1], ["soda", 1]]);
  assert.equal(s.items[0].modifiers[0].option, "Mango habanero"); assert.equal(f.creates(), 0);
  const foreign = await bot.advance(null, { ...native, catalogSelection: { ...native.catalogSelection, sellerJid: "5215555555555@s.whatsapp.net" } });
  assert.equal(foreign.session?.step, "human");
  let unclear = (await bot.advance(null, native)).session!;
  unclear = (await bot.advance(unclear, input("ese"))).session!;
  assert.equal(unclear.step, "catalog_recovery");
  unclear = (await bot.advance(unclear, input("ese mismo"))).session!;
  assert.equal(unclear.step, "human"); assert.equal(f.creates(), 0);
});
