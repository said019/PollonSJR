import test from "node:test";
import assert from "node:assert/strict";
import { WhatsAppBot } from "./bot";
import { answerQuestion, isQuestion, type QuestionDecision } from "./questions";
import { restore, protect } from "./reply-writer";
import { createSimulationFixture } from "./testing/fixture";
const phone="4270000099";
const key=`wa:bot:${phone}:session`;
const exact="Buenas tardes tienes servicio el día de hoy";
const decision:QuestionDecision={topics:["hours"],productIds:[],day:"today",detail:"availability"};

test("the reported service question preserves every draft, never dumps a menu and works without AI",async t=>{
 const old=process.env.WHATSAPP_AI_ENABLED;process.env.WHATSAPP_AI_ENABLED="false";
 t.after(()=>{if(old===undefined)delete process.env.WHATSAPP_AI_ENABLED;else process.env.WHATSAPP_AI_ENABLED=old;});
 for(const mode of [{},{acceptOrders:false},{isOpen:false}])for(const step of [null,"menu","quantity","name","confirm"]){
  const f=createSimulationFixture();f.storage.set("store:config",JSON.stringify({...f.config,...mode}));
  const session=step?{step,checkoutId:"existing",items:[],catalog:[]}:null;
  if(session)f.storage.set(key,JSON.stringify(session));
  await new WhatsAppBot(f.app,async()=>{throw Error("Status must not enter order interpretation");}).handle({id:"status",phone,text:exact,fromMe:false});
  const reply=JSON.parse(f.queue[0]).params.text;
  assert.match(reply,"isOpen" in mode?/cerrado por hoy/:"acceptOrders" in mode?/pausa temporal/:/Estamos tomando pedidos/);
  assert.doesNotMatch(reply,/No me queda clara|opciones|Tu pedido sigue igual|Menú de|wa.me\/c|18:40|6:40/);
  assert.deepEqual(JSON.parse(f.storage.get(key)||"null"),session);assert.equal(f.creates(),0);
 }
});

test("semantic queries without keyword matches are answered before order interpretation",async t=>{
 const oldFetch=globalThis.fetch;const oldKey=process.env.ANTHROPIC_API_KEY,oldEnabled=process.env.WHATSAPP_AI_ENABLED;
 process.env.ANTHROPIC_API_KEY="synthetic";process.env.WHATSAPP_AI_ENABLED="true";
 t.after(()=>{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=oldKey;if(oldEnabled===undefined)delete process.env.WHATSAPP_AI_ENABLED;else process.env.WHATSAPP_AI_ENABLED=oldEnabled;});
 let classifierCalls=0;
 globalThis.fetch=async(_url,init)=>{
  const b=JSON.parse(init!.body as string),name=b.tool_choice.name,input=JSON.parse(b.messages[0].content);
  if(name==="clasificar_consulta")classifierCalls++;
  return new Response(JSON.stringify({stop_reason:"tool_use",content:[{type:"tool_use",name,input:name==="clasificar_consulta"?decision:name==="redactar"?{text:input.respuesta_autorizada}:{valid:true}}]}));
 };
 for(const text of ["buenas andan trabajando hoy","andan chambeando ahorita","me confirmas si atienden hoy","puedo encargar algo en este momento"]){
  assert.equal(isQuestion(text),false);
  const f=createSimulationFixture();await new WhatsAppBot(f.app,async()=>{throw Error("Query routed to order interpreter");}).handle({id:"semantic",phone,text,fromMe:false});
  assert.match(JSON.parse(f.queue[0]).params.text,/Estamos tomando pedidos/);assert.equal(f.storage.has(key),false);assert.equal(f.creates(),0);
 }
 assert.equal(classifierCalls,4);
 // Numeric choices, explicit commands and personal fields never reach the classifier.
 const f=createSimulationFixture();const bot=new WhatsAppBot(f.app);
 for(const [i,text] of ["pedir","1","1","listo","Ana","1","sin notas","efectivo","exacto"].entries())await bot.handle({id:`checkout-${i}`,phone,text,fromMe:false});
 assert.equal(classifierCalls,4);assert.equal(JSON.parse(f.storage.get(key)!).step,"confirm");assert.equal(f.creates(),0);
 // Staff takeover is checked before all classification or response generation.
 f.storage.set(`wa:bot:${phone}:human`,"1");const count=f.queue.length;
 await bot.handle({id:"held",phone,text:"andan chambeando ahorita",fromMe:false});
 assert.equal(f.queue.length,count);assert.equal(classifierCalls,4);
});

test("unavailable or negative semantic classification does not consume an ordinary order request",async()=>{
 const f=createSimulationFixture();
 for(const result of [null,{...decision,topics:["none"] as QuestionDecision["topics"]}]){
  assert.equal(await answerQuestion(f.app,"quiero dos pollos",[],async()=>result),null);
 }
});

test("unclear first messages do not invent a prior order or attach the entire menu",async t=>{
 const oldKey=process.env.ANTHROPIC_API_KEY,oldEnabled=process.env.WHATSAPP_AI_ENABLED;
 process.env.ANTHROPIC_API_KEY="synthetic";process.env.WHATSAPP_AI_ENABLED="true";
 t.after(()=>{if(oldKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=oldKey;if(oldEnabled===undefined)delete process.env.WHATSAPP_AI_ENABLED;else process.env.WHATSAPP_AI_ENABLED=oldEnabled;});
 const f=createSimulationFixture();const reply=await new WhatsAppBot(f.app,async()=>({action:"clarify",code:"",evidence:""})).advanceWithAI(null,{id:"unclear",phone,text:"eso de la otra vez",fromMe:false});
 assert.equal(reply.text,"¿Quieres consultar algo del menú o hacer un pedido?");assert.equal(f.creates(),0);
});

test("natural courtesies cannot stack greetings or add unsupported commercial claims",()=>{
 const original="¡Hola! ¿Qué te gustaría pedir?",p=protect(original);
 assert.equal(restore("¡Buenas tardes!\n[[P0]]",original,p.lines),null);
 assert.equal(restore("¡Hola!\nGracias por escribirnos.\n[[P0]]","Respuesta",["Respuesta"]),null);
 assert.equal(restore("Te hacemos descuento.\n[[P0]]","Respuesta",["Respuesta"]),null);
});
