import assert from "node:assert/strict";
import test from "node:test";
import { parseGeocodingResponse, geocodeAddress } from "./geocoder";
import { resolveCatalog } from "./catalog";
import { sendWhatsAppEvolution, type NotificationJob } from "../notifications/whatsapp.service";

const candidate = {
  formatted_address: "Calle Uno 123, San Juan del Río, México", partial_match: false,
  address_components: [{ short_name: "123", types: ["street_number"] }, { short_name: "Uno", types: ["route"] }, { short_name: "MX", types: ["country"] }],
  geometry: { location_type: "ROOFTOP", location: { lat: 20.38, lng: -99.99 } },
};

test("geocoding rejects partial matches, centroids, missing street numbers and other countries", () => {
  assert.equal(parseGeocodingResponse({ status: "OK", results: [candidate] }).length, 1);
  for (const bad of [
    { ...candidate, partial_match: true },
    { ...candidate, geometry: { ...candidate.geometry, location_type: "APPROXIMATE" } },
    { ...candidate, address_components: candidate.address_components.filter(c => !c.types.includes("street_number")) },
    { ...candidate, address_components: candidate.address_components.map(c => c.short_name === "MX" ? { ...c, short_name: "US" } : c) },
  ]) assert.equal(parseGeocodingResponse({ status: "OK", results: [bad] }).length, 0);
  assert.equal(parseGeocodingResponse({ status: "ZERO_RESULTS", results: [] }).length, 0);
});

function env(t: { after: (fn: () => void) => void }, values: Record<string, string>) {
  const old = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  t.after(() => { for (const key of Object.keys(values)) { if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]; } });
}

test("address lookup is bounded, encoded and never sends an Anthropic request", async t => {
  env(t, { GOOGLE_GEOCODING_API_KEY: "test-geocode" });
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const request = new URL(url);
    assert.equal(request.hostname, "maps.googleapis.com"); assert.equal(request.searchParams.get("components"), "country:MX");
    assert.equal(request.searchParams.get("address"), "Calle Uno #123 & Centro"); assert.ok(options.signal);
    return new Response(JSON.stringify({ status: "OK", results: [candidate] }));
  });
  assert.equal((await geocodeAddress("Calle Uno #123 & Centro"))[0].lat, 20.38);
});

test("native cart resolver uses the read-only order details endpoint and requires exact mappings", async t => {
  env(t, { EVOLUTION_API_URL: "https://evolution.example", EVOLUTION_API_KEY: "test-evo", EVOLUTION_INSTANCE: "test", WHATSAPP_CATALOG_PHONE: "5214428219534" });
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://evolution.example/business/getOrderDetails/test");
    assert.deepEqual(JSON.parse(options.body as string), { orderId: "order", token: "opaque", sellerJid: "5214428219534@s.whatsapp.net" });
    return new Response(JSON.stringify({ products: [{ id: "native", quantity: 2, price: 0 }] }));
  });
  const app = { prisma: { whatsAppCatalogLink: { findMany: async () => [{ externalId: "native", productId: "app-product", variant: "Grande" }] } } } as any;
  const result = await resolveCatalog(app, { orderId: "order", token: "opaque", sellerJid: "5214428219534@s.whatsapp.net" });
  assert.deepEqual(result, [{ productId: "app-product", qty: 2, variant: "Grande" }]);
  await assert.rejects(resolveCatalog(app, { sellerJid: "5214428219534@s.whatsapp.net", lines: [{ id: "missing", quantity: 1 }] }), /sin vincular/);
  await assert.rejects(resolveCatalog(app, { sellerJid: "5214428219534@s.whatsapp.net", lines: [{ id: "native", quantity: 20 }, { id: "native", quantity: 1 }] }), /límite/);
});

const job: NotificationJob = { id: "job", to: "4271234567", type: "whatsapp", template: "bot_reply", params: { text: "Resumen: total $150" }, attempts: 0, createdAt: new Date().toISOString(), confirmation: { checkoutId: "checkout", code: "ABC123" } };

test("confirmation buttons bind checkout and revision; unsupported buttons fall back to a replyable summary", async t => {
  env(t, { EVOLUTION_API_URL: "https://evolution.example", EVOLUTION_API_KEY: "test-evo", EVOLUTION_INSTANCE: "test", WHATSAPP_REPLY_BUTTONS: "true" });
  let calls = 0; let marker: unknown;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls++;
    const body = JSON.parse(options.body as string);
    if (url.includes("sendButtons")) {
      assert.equal(body.buttons[0].id, "wa_confirm:checkout:ABC123");
      assert.equal(body.buttons[0].displayText, "Confirmar pedido");
      return new Response("Unsupported", { status: 400 });
    }
    assert.ok(url.includes("sendText")); assert.equal(body.text, job.params.text);
    return new Response(JSON.stringify({ key: { id: "delivered-id" } }));
  });
  const redis = { set: async (...args: unknown[]) => { marker = args; } } as any;
  await sendWhatsAppEvolution(job, redis);
  assert.equal(calls, 2);
  assert.deepEqual(marker, ["wa:summary:4271234567:checkout:ABC123", "delivered-id", { EX: 600 }]);
});

test("sender never marks failed sends as delivered or falls back after ambiguous 5xx", async t => {
  env(t, { EVOLUTION_API_URL: "https://evolution.example", EVOLUTION_API_KEY: "test-evo", EVOLUTION_INSTANCE: "test", WHATSAPP_REPLY_BUTTONS: "true" });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("Unavailable", { status: 503 }); });
  await assert.rejects(sendWhatsAppEvolution(job, { set: async () => assert.fail("must not mark delivered") } as any));
  assert.equal(calls, 1);
});
