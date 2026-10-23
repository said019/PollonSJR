import test from "node:test";
import assert from "node:assert/strict";
import { answerQuestion, renderHours, isQuestion, type QuestionDecision } from "./questions";
import { createSimulationFixture } from "./testing/fixture";
const now=new Date("2026-10-20T20:30:00-06:00");
const decision=(overrides:Partial<QuestionDecision>={}):QuestionDecision=>({topics:["hours"],productIds:[],day:"schedule",detail:"general",...overrides});
test("public schedule answers today, tomorrow and closed days without leaking internal cutoff",()=>{
 const config={openDays:[1,3,4,5,6,0],openTime:"10:00",closeTime:"19:00",ORDER_CUTOFF_TIME:"18:40"};
 assert.match(renderHours(config,"today",now),/Hoy.*no es día de servicio/);
 assert.match(renderHours(config,"tomorrow",now),/Mañana.*10:00 a 19:00/);
 assert.match(renderHours(config,"tuesday",now),/martes.*no es día de servicio/);
 for(const d of ["schedule","today","tomorrow","tuesday"] as const)assert.doesNotMatch(renderHours(config,d,now),/18:40|6:40/);
 assert.match(renderHours({...config,openDays:[]},"schedule",now),/domingo.*lunes.*martes/);
});
test("informational questions remain useful through every closed state without orders or changes",async()=>{
 for(const mode of [{isOpen:false},{acceptOrders:false},{openDays:[3]},{closeTime:"19:00"}]){
  const f=createSimulationFixture();f.storage.set("store:config",JSON.stringify({...f.config,...mode}));
  const before=f.storage.get("store:config");
  for(const q of ["¿Qué horarios tienen?","¿y mañana?","¿Cuánto cuesta el pollo?","¿Qué incluye ese?","¿Tienen domicilio?"]){
   const d=q.includes("cuesta")?decision({topics:["products"],productIds:["pollo"],detail:"price"}):q.includes("incluye")?decision({topics:["products"],productIds:["pollo"],detail:"contents"}):q.includes("domicilio")?decision({topics:["delivery"]}):decision({day:q.includes("mañana")?"tomorrow":"schedule"});
   const reply=await answerQuestion(f.app,q,[],async()=>d,now);assert.ok(reply);assert.notEqual(reply,"No estamos aceptando pedidos en este momento.");assert.equal(f.creates(),0);assert.equal(f.storage.get("store:config"),before);
   if(q.includes("cuesta"))assert.match(reply!,/\$150.00/);
   if(q.includes("incluye"))assert.match(reply!,/No tengo confirmado qué incluye/);
  }
 }
});
test("ambiguity, unknown details and AI failure clarify rather than fabricate",async()=>{
 const f=createSimulationFixture();
 const ambiguous=await answerQuestion(f.app,"¿y el otro?",[],async()=>decision({topics:["products"]}),now);assert.match(ambiguous!,/qué producto/);
 const unknown=await answerQuestion(f.app,"¿Dónde están?",[],async()=>decision({topics:["unknown"]}),now);assert.match(unknown!,/confirmártelo el equipo/);
 const fallback=await answerQuestion(f.app,"¿a qué hora abren?",[],async()=>null,now);assert.match(fallback!,/Horario habitual/);
 assert.equal(await answerQuestion(f.app,"quiero pedir",[],async()=>decision({topics:["none"]})),null);
 for(const q of ["y mañana?","a que hora","que incluye","cuanto cuesta","¿y ese?"])assert.equal(isQuestion(q),true);
});

test("handler answers informational questions during a draft without consuming selections or confirming",async t=>{
 const {WhatsAppBot}=await import("./bot");const oldFetch=globalThis.fetch;const oldKey=process.env.ANTHROPIC_API_KEY,oldEnabled=process.env.WHATSAPP_AI_ENABLED;
 process.env.ANTHROPIC_API_KEY="synthetic";process.env.WHATSAPP_AI_ENABLED="true";
 t.after(()=>{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=oldKey;if(oldEnabled===undefined)delete process.env.WHATSAPP_AI_ENABLED;else process.env.WHATSAPP_AI_ENABLED=oldEnabled;});
 const histories:unknown[]=[];
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(init!.body as string);const name=body.tool_choice.name;const input=JSON.parse(body.messages[0].content);
  if(name==="clasificar_consulta")histories.push(input.recent);
  return new Response(JSON.stringify({stop_reason:"tool_use",content:[{type:"tool_use",name,input:name==="clasificar_consulta"?decision({topics:["products"],productIds:["pollo"],detail:"price"}):name==="redactar"?{text:input.respuesta_autorizada}:{valid:true}}]}));};
 const f=createSimulationFixture();const bot=new WhatsAppBot(f.app);const phone="4270000001";
 const session={step:"quantity",checkoutId:"preserve",catalog:[],items:[]};f.storage.set(`wa:bot:${phone}:session`,JSON.stringify(session));
 await bot.handle({id:"one",phone,text:"¿cuánto cuesta el pollo?",fromMe:false});
 assert.deepEqual(JSON.parse(f.storage.get(`wa:bot:${phone}:session`)!),session);assert.match(JSON.parse(f.queue[0]).params.text,/150.00/);assert.equal(f.creates(),0);
 await bot.handle({id:"two",phone,text:"¿y ese?",fromMe:false});assert.equal((histories[1] as unknown[]).length,1);
 await bot.handle({id:"one",phone:"4270000002",text:"¿cuánto cuesta el pollo?",fromMe:false});assert.deepEqual(histories[2],[]);
 f.storage.set(`wa:bot:${phone}:session`,JSON.stringify({...session,step:"human"}));const length=f.queue.length;
 await bot.handle({id:"three",phone,text:"¿cuánto cuesta?",fromMe:false});assert.equal(f.queue.length,length);
});

test("focused followups use the last identified product even if AI is unavailable; ambiguity does not guess",async()=>{
 const f=createSimulationFixture();let calls=0;
 for(const message of ["¿qué sabores hay?","ke trae?","¿lleva refresco?","¿cuánto cuesta ese?","¿Y cuánto cuestan?","¿entonces no lleva huevo?"]){
  const text=await answerQuestion(f.app,message,[{customer:"¿cuánto cuesta el pollo?",reply:"Pollo\nPrecio actual: $150.00."}],async()=>{calls++;return null;},now);
  assert.match(text!,/Pollo/);assert.match(text!,/150.00/);
 }
 assert.equal(calls,0);
 for(const q of ["¿y el otro?","¿Cuántas personas comen?","como llego?"])assert.equal(isQuestion(q),true);
 const text=await answerQuestion(f.app,"¿qué sabores hay?",[{customer:"sushi?",reply:"No identifiqué ese producto."}],async()=>null,now);
 assert.match(text!,/Qué producto|qué producto/);
});

test("plural price followup quotes all previously shown products rather than choosing one",async()=>{
 const f=createSimulationFixture();const products=[{id:"one",name:"Boneless",price:8500,modifiers:[]},{id:"two",name:"Hamburguesa de Boneless",price:10900,modifiers:[]}];
 f.app.prisma.product.findMany=async()=>products;
 const reply=await answerQuestion(f.app,"¿Y cuánto cuestan?",[{customer:"tienen boneless?",reply:"Boneless\nPrecio actual: $85.00.\nHamburguesa de Boneless\nPrecio actual: $109.00."}],async()=>{throw Error("No guessing or AI required")},now);
 assert.match(reply!,/85.00/);assert.match(reply!,/109.00/);assert.equal(f.creates(),0);
});

 test("drink presentation questions never substitute 355 ml for requested 600 ml",async()=>{
 const f=createSimulationFixture();
 f.app.prisma.product.findMany=async()=>[{id:"soda",name:"Refresco",description:"Coca-Cola, Pepsi, Jarritos u otra. 355ml.",price:3000,modifiers:[],variants:null,soldOut:false}] as any;
 for(const q of ["Tiene refresco de 600?","¿Hay Coca de 600 ml?","¿Tienen refresco de 0.6 litros?","refresco de 600 mililitros?"]){
 const reply=await answerQuestion(f.app,q,[],async()=>decision({topics:["products"],productIds:["soda"],detail:"availability"}),now);
 assert.match(reply!,/De 600 ml no tengo disponibilidad confirmada/);assert.match(reply!,/355 ml/);
 assert.doesNotMatch(reply!,/\$30|disponibilidad se verifica/);assert.equal(f.creates(),0);
 }
 const exact=await answerQuestion(f.app,"¿Hay refresco de 355 ml?",[],async()=>decision({topics:["products"],productIds:["soda"],detail:"availability"}),now);
 assert.match(exact!,/\$30/);assert.doesNotMatch(exact!,/no tengo disponibilidad confirmada/);
 });
