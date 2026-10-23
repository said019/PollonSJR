import test from "node:test";
import assert from "node:assert/strict";
import { WhatsAppBot, productSchema, type Session } from "./bot";
import { applyPlan, type OrderPlan, type PlanContext } from "./order-planner";
import { createSimulationFixture } from "./testing/fixture";
const products = [
 {id:"six",name:"6 Piezas",price:14500,variants:null,modifiers:[]},
 {id:"eight",name:"8 Piezas",price:16900,variants:null,modifiers:[]},
 {id:"burger",name:"Hamburguesa Crujiente",price:6800,variants:[{label:"Sencilla",price:6800},{label:"Doble",price:8500}],modifiers:[{name:"Papas",required:false,minSelect:0,maxSelect:1,totalQuota:null,options:[{label:"Con papas",price:2000}]}]},
 {id:"side",name:"Complemento Chico",price:2000,variants:null,modifiers:[{name:"Sabor",required:true,minSelect:1,maxSelect:1,totalQuota:null,options:[{label:"Puré",price:0},{label:"Sopa",price:0},{label:"Ensalada",price:0}]}]},
].map(p=>productSchema.parse(p));
const message="Quisiera también una hamburguesa cruji sencilla con papas\nDe complementos serían uno de cada uno\nY las 8 pz de pollo";
const input=(text:string)=>({text,phone:"4270000088",id:crypto.randomUUID(),fromMe:false});
const line=(productId:string,qty=1,variant:string|null=null,modifiers:any[]=[])=>({productId,qty,variant,modifiers});
const plan:OrderPlan={action:"edit",question:"",operations:[
 {target:null,evidence:"una hamburguesa cruji sencilla con papas",lines:[line("burger",1,"Sencilla",[{name:"Papas",option:"Con papas",qty:1}])]},
 {target:"pending",evidence:"uno de cada uno",lines:["Puré","Sopa","Ensalada"].map(option=>line("side",1,null,[{name:"Sabor",option,qty:1}]))},
 {target:"item:0",evidence:"reemplaza las seis",lines:[line("eight")]},
]};
function env(t:any){const old={...process.env};process.env.WHATSAPP_AI_ENABLED="true";process.env.ANTHROPIC_API_KEY="synthetic";t.after(()=>{process.env=old;});}
async function fixture(planner:any){const f=createSimulationFixture();f.app.prisma.product.findMany=async({where}:any)=>where?.id?.in?products.filter(p=>where.id.in.includes(p.id)):products;
 const bot=new WhatsAppBot(f.app,async()=>null,async()=>[],planner);
 // Seed exactly the native cart's unfinished state without depending on a model.
 const s:Session={step:"modifier",checkoutId:crypto.randomUUID(),catalog:products,items:[{productId:"six",name:"6 Piezas",qty:1,unitPrice:14500,modifiers:[],configuration:JSON.stringify(products[0])}],selected:products[3],pending:{productId:"side",name:"Complemento Chico",qty:3,unitPrice:2000,modifiers:[],configuration:JSON.stringify(products[3])},modifierIndex:0,batchOrder:true,name:"Cliente Prueba",type:"PICKUP",address:"Calle Prueba 64",lat:20.38,lng:-99.98};
 return {f,bot,s};}
test("combined native-cart follow-up retains every instruction through ambiguity, checkout and one confirmation",async t=>{
 env(t);let calls=0;
 const {f,bot,s}=await fixture(async(c:PlanContext)=>{calls++;if(calls===1){assert.equal(c.basket.length,2);return {action:"clarify",question:"¿Las ocho piezas reemplazan las seis o las agregamos?",operations:[]};}if(calls===2){assert.deepEqual(c.messages,[message,"reemplaza las seis"]);return plan;}return {action:"unrelated",question:"",operations:[]};});
 const original=structuredClone(s);
 let r=await bot.advanceWithAI(s,input(message));assert.deepEqual(r.session!.items,original.items);assert.deepEqual(r.session!.pending,original.pending);
 r=await bot.advanceWithAI(r.session,input("reemplaza las seis"));let current=r.session!;
 assert.equal(current.items.length,5);assert.equal(current.items[0].productId,"eight");assert.equal(current.items[4].productId,"burger");assert.equal(current.items[4].modifiers[0].price,2000);
 assert.equal(current.address,original.address);assert.equal(current.lat,original.lat);assert.equal(current.checkoutId,s.checkoutId);assert.equal(current.step,"notes");assert.equal(current.pendingPlan,undefined);
 for(const text of ["sin notas","efectivo","exacto"])current=(await bot.advanceWithAI(current,input(text))).session!;
 assert.equal(current.total,31700);assert.equal(f.creates(),0);
 const confirm={...input(""),buttonId:`wa_confirm:${current.checkoutId}:${current.confirmation!.code}`};const copy=structuredClone(current);
 await bot.advanceWithAI(current,confirm);await bot.advanceWithAI(copy,confirm);assert.equal(f.creates(),1);
});
test("untrusted plan cannot inject products, prices, excessive modifiers, targets, or partial operations",()=>{
 const context:PlanContext={messages:[message,"reemplaza las seis"],catalog:products,basket:[{ref:"item:0",productId:"six",qty:1},{ref:"pending",productId:"side",qty:3}]};
 assert.ok(applyPlan(plan,context));
 for(const mutate of [(p:any)=>p.operations[0].lines[0].productId="free",(p:any)=>p.operations[0].lines[0].price=0,(p:any)=>p.operations[0].lines[0].modifiers[0].qty=5,(p:any)=>p.operations[1].target="other",(p:any)=>p.operations[0].evidence="regalame",(p:any)=>p.operations.push(p.operations[1]),(p:any)=>p.operations[0].lines[0].variant="Gratis"]){const invalid=structuredClone(plan);mutate(invalid);assert.equal(applyPlan(invalid,context),null);}
});
test("human takeover and closed store prevent planner calls or draft changes",async t=>{
 env(t);let calls=0;const {bot,s,f}=await fixture(async()=>{calls++;return plan;});
 s.step="human";assert.equal((await bot.advanceWithAI(s,input(message))).text,"");assert.equal(calls,0);
 s.step="modifier";f.storage.set("store:config",JSON.stringify({...f.config,acceptOrders:false}));
 const before=JSON.stringify(s.items);await bot.advanceWithAI(s,input(message));assert.equal(calls,0);assert.equal(JSON.stringify(s.items),before);
});
test("invalid multi-operation plan retains full basket and delivery information",async t=>{
 env(t);const bad=structuredClone(plan);bad.operations[2].lines[0].productId="unknown";
 const {bot,s}=await fixture(async()=>bad);const before=structuredClone(s);
 const r=await bot.advanceWithAI(s,input(message+" reemplaza las seis"));assert.deepEqual(r.session!.items,before.items);assert.deepEqual(r.session!.pending,before.pending);assert.equal(r.session!.address,before.address);assert.ok(r.session!.pendingPlan);
});
test("one-of-each cannot enlarge sides or change the purchased quantity",()=>{
 const large=productSchema.parse({...products[3],id:"large",name:"Complemento Grande",price:3800});
 const context:PlanContext={messages:[message,"reemplaza las seis"],catalog:[...products,large],basket:[{ref:"item:0",productId:"six",qty:1},{ref:"pending",productId:"side",qty:3}]};
 const wrongSize=structuredClone(plan);wrongSize.operations[1].lines[1].productId="large";assert.equal(applyPlan(wrongSize,context),null);
 const wrongQty=structuredClone(plan);wrongQty.operations[1].lines[0].qty=2;assert.equal(applyPlan(wrongQty,context),null);
});
test("a model outage during clarification preserves both messages and every existing field",async t=>{
 env(t);const {bot,s}=await fixture(async()=>null);s.pendingPlan={messages:[message],question:"¿Reemplazar o agregar?"};
 const r=await bot.advanceWithAI(s,input("Reemplaza las seis"));assert.deepEqual(r.session!.pendingPlan!.messages,[message,"Reemplaza las seis"]);assert.deepEqual(r.session!.items,s.items);assert.deepEqual(r.session!.pending,s.pending);assert.equal(r.session!.address,s.address);
});
test("semantic audit repairs a dropped clause before returning any executable plan",async t=>{
 env(t);const {planWithClaude}=await import("./order-planner");const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 const context:PlanContext={messages:[message,"reemplaza las seis"],catalog:products,basket:[{ref:"item:0",productId:"six",qty:1},{ref:"pending",productId:"side",qty:3}]};
 let requests=0,audits=0;
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));const name=body.tool_choice.name;let value:any;
 if(name==="auditar"){audits++;value={complete:audits>1,reason:audits===1?"Falta la hamburguesa solicitada":""};}
 else{requests++;value=requests===1?{...plan,operations:plan.operations.slice(1)}:plan;if(requests===2)assert.match(body.messages[0].content,/Falta la hamburguesa/);}
 if(name==="plan_pedido") { value=structuredClone(value);for(const op of value.operations)for(const l of op.lines)l.productId=`P${products.findIndex(p=>p.id===l.productId)+1}`; }
 return new Response(JSON.stringify({stop_reason:"tool_use",content:[{type:"tool_use",name,input:value}]}),{status:200});};
 assert.deepEqual(await planWithClaude(context),plan);assert.equal(requests,2);assert.equal(audits,2);
});
test("persistent semantic failure returns no partial plan after the bounded repair",async t=>{
 env(t);const {planWithClaude}=await import("./order-planner");const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 let calls=0;globalThis.fetch=async(_url,init)=>{calls++;const name=JSON.parse(String(init?.body)).tool_choice.name;return new Response(JSON.stringify({stop_reason:"tool_use",content:[{type:"tool_use",name,input:name==="auditar"?{complete:false,reason:"Cambio de cantidad no solicitado"}:{...plan,operations:plan.operations.map(o=>({...o,lines:o.lines.map(l=>({...l,productId:`P${products.findIndex(p=>p.id===l.productId)+1}`}))}))}}]}),{status:200});};
 assert.equal(await planWithClaude({messages:[message,"reemplaza las seis"],catalog:products,basket:[{ref:"item:0",productId:"six",qty:1},{ref:"pending",productId:"side",qty:3}]}),null);assert.equal(calls,4);
});
test("combined change keeps a complete delivery address and reaches one order with the app delivery fee",async t=>{
 env(t);const {bot,s,f}=await fixture(async()=>plan);
 Object.assign(s,{type:"DELIVERY",facade:"Puerta azul",deliveryPhone:"4270000088"});
 f.storage.set("store:location",JSON.stringify({lat:20.38,lng:-99.98}));f.storage.set("delivery:zones",JSON.stringify([{id:"test",name:"Prueba",minKm:0,maxKm:6,fee:6000,active:true,sortOrder:0}]));
 let r=await bot.advanceWithAI(s,input(message+" reemplaza las seis"));assert.equal(r.session!.step,"notes");assert.doesNotMatch(r.text,/ubicación|dirección|teléfono|nombre/);
 let current=r.session!;for(const text of ["sin notas","efectivo","exacto"])current=(await bot.advance(current,input(text))).session!;
 assert.equal(current.total,37700);assert.equal(current.address,s.address);assert.equal(current.facade,s.facade);assert.equal(current.deliveryPhone,s.deliveryPhone);
 await bot.advance(current,{...input(""),buttonId:`wa_confirm:${current.checkoutId}:${current.confirmation!.code}`});assert.equal(f.creates(),1);
});
test("editing an uncommitted summary rotates confirmation without requesting collected fields again",async t=>{
 env(t);const add:OrderPlan={action:"edit",question:"",operations:[{target:null,evidence:"Agrega ocho piezas",lines:[line("eight")]}]};
 const {bot,s}=await fixture(async()=>add);delete s.pending;delete s.selected;s.step="confirm";s.notes="";s.confirmation={code:"OLD",expiresAt:Date.now()+100000};s.total=14500;
 const r=await bot.advanceWithAI(s,input("Agrega ocho piezas"));assert.equal(r.session!.step,"confirm");assert.equal(r.session!.total,31400);assert.notEqual(r.session!.confirmation!.code,"OLD");assert.doesNotMatch(r.text,/¿A qué nombre|¿Pagas en efectivo/);
});
test("a removed untouched product rejects the plan without crashing or discarding other lines",()=>{
 const context:PlanContext={messages:["Agrega ocho piezas"],catalog:products,basket:[{ref:"item:0",productId:"removed",qty:1}]};
 assert.equal(applyPlan({action:"edit",question:"",operations:[{target:null,evidence:"Agrega ocho piezas",lines:[line("eight")]}]},context),null);
});
test("requesting staff while an AI clarification is pending never applies the pending plan",async t=>{
 env(t);let calls=0;const {bot,s}=await fixture(async()=>{calls++;return plan;});s.pendingPlan={messages:[message],question:"¿Reemplazar o agregar?"};
 const before=structuredClone(s.items);const r=await bot.advanceWithAI(s,input("ASESOR"));assert.equal(calls,0);assert.equal(r.session!.step,"human");assert.deepEqual(r.session!.items,before);
});
