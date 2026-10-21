import assert from "node:assert/strict";
import test from "node:test";
import { interpretWithClaude, validateDecision, BOT_AI_RULES } from "./claude-interpreter";

const context = { step: "menu", choices: [{ code: "1", label: "Pollo" }], message: "Quiero pollo" };

test("AI cannot invent actions, unknown choices, prices or evidence", () => {
  assert.equal(validateDecision({ action: "choice", code: "confirmar", evidence: "pollo" }, context), null);
  assert.equal(validateDecision({ action: "choice", code: "99", evidence: "pollo" }, context), null);
  assert.equal(validateDecision({ action: "choice", code: "1", evidence: "dos pollos" }, context), null);
  assert.equal(validateDecision({ action: "choice", code: "1", evidence: "pollo", price: 0 }, context), null);
  assert.equal(validateDecision({ action: "create_order", code: "1", evidence: "pollo" }, context), null);
  assert.equal(validateDecision({ action: "choice", code: "1", evidence: "pollo" }, context)?.code, "1");
  assert.equal(validateDecision({ action: "clarify", code: "", evidence: "" }, context)?.action, "clarify");
});

test("server rejects partial selections that drop preparation, schedule, delivery or payment instructions", () => {
  for (const message of ["pollo sin cebolla", "pollo con salsa", "pollo para mañana", "pollo a las 8", "pollo a domicilio", "pollo, te transfiero después"]) {
    const action = message.includes("transfiero") ? "human" : "clarify";
    for (const evidence of ["pollo", message]) {
      assert.equal(validateDecision({ action: "choice", code: "1", evidence }, { ...context, message })?.action, action);
    }
  }
  const mod = { step: "modifier", choices: [{ code: "1", label: "Sin salsa" }], message: "sin salsa" };
  assert.equal(validateDecision({ action: "choice", code: "1", evidence: "sin salsa" }, mod)?.action, "choice");
  const delivery = { step: "type", choices: [{ code: "2", label: "Entrega a domicilio" }], message: "a domicilio" };
  assert.equal(validateDecision({ action: "choice", code: "2", evidence: "a domicilio" }, delivery)?.action, "choice");
});

test("Anthropic request uses bounded tools and rejects multiple calls, prose and incomplete output", async t => {
  const oldEnabled = process.env.WHATSAPP_AI_ENABLED; const oldKey = process.env.ANTHROPIC_API_KEY;
  process.env.WHATSAPP_AI_ENABLED = "true"; process.env.ANTHROPIC_API_KEY = "test-only-key";
  t.after(() => {
    if (oldEnabled === undefined) delete process.env.WHATSAPP_AI_ENABLED; else process.env.WHATSAPP_AI_ENABLED = oldEnabled;
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey;
  });
  const tool = { type: "tool_use", name: "proponer_seleccion", input: { action: "choice", code: "1", evidence: "pollo" } };
  let result: unknown = { stop_reason: "tool_use", content: [tool] };
  let body: any;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    body = JSON.parse(options.body as string);
    assert.ok(options.signal);
    return new Response(JSON.stringify(result), { status: 200 });
  });
  assert.equal((await interpretWithClaude(context))?.code, "1");
  assert.equal(body.system, BOT_AI_RULES); assert.equal(body.max_tokens, 512);
  assert.equal(body.tools.length, 1); assert.equal(body.tools[0].name, "proponer_seleccion");
  assert.deepEqual(body.tool_choice, { type: "tool", name: "proponer_seleccion", disable_parallel_tool_use: true });
  assert.deepEqual(body.tools[0].input_schema.properties.code.enum, ["", "1"]);
  assert.equal(body.messages.length, 1);
  result = { stop_reason: "tool_use", content: [tool, tool] };
  assert.equal(await interpretWithClaude(context), null);
  result = { stop_reason: "max_tokens", content: [tool] };
  assert.equal(await interpretWithClaude(context), null);
  result = { stop_reason: "end_turn", content: [{ type: "text", text: "Tu pedido está pagado y confirmado" }] };
  assert.equal(await interpretWithClaude(context), null);
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(await interpretWithClaude(context), null);
});

test("Anthropic API errors and network failures safely fall back", async t => {
  const oldEnabled = process.env.WHATSAPP_AI_ENABLED; const oldKey = process.env.ANTHROPIC_API_KEY;
  process.env.WHATSAPP_AI_ENABLED = "true"; process.env.ANTHROPIC_API_KEY = "test-only-key";
  t.after(() => {
    if (oldEnabled === undefined) delete process.env.WHATSAPP_AI_ENABLED; else process.env.WHATSAPP_AI_ENABLED = oldEnabled;
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey;
  });
  const mock = t.mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status: 429 }));
  assert.equal(await interpretWithClaude(context), null);
  mock.mock.mockImplementation(async () => { throw new Error("timeout"); });
  assert.equal(await interpretWithClaude(context), null);
});

test("multi-workspace keys include the configured workspace header without adding it to model context", async t => {
  const previous = { key: process.env.ANTHROPIC_API_KEY, enabled: process.env.WHATSAPP_AI_ENABLED, workspace: process.env.ANTHROPIC_WORKSPACE_ID };
  process.env.ANTHROPIC_API_KEY = "test-only-key"; process.env.WHATSAPP_AI_ENABLED = "true"; process.env.ANTHROPIC_WORKSPACE_ID = "wrkspc_test";
  t.after(() => {
    for (const [name, value] of [["ANTHROPIC_API_KEY", previous.key], ["WHATSAPP_AI_ENABLED", previous.enabled], ["ANTHROPIC_WORKSPACE_ID", previous.workspace]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
  });
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get("anthropic-workspace-id"), "wrkspc_test");
    assert.ok(!String(options.body).includes("wrkspc_test"));
    return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "proponer_seleccion", input: { action: "choice", code: "1", evidence: "pollo" } }] }));
  });
  assert.equal((await interpretWithClaude(context))?.code, "1");
});
