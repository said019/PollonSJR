import test from "node:test";
import assert from "node:assert/strict";
import { WhatsAppInbox, inboxKeys } from "./inbox";
import { WhatsAppBot, productSchema } from "./bot";
import { createSimulationFixture } from "./testing/fixture";
import { validRecipient } from "./delivery-details";
const phone="4270000088";
const input=(text:string,id:string=crypto.randomUUID())=>({text,id,phone,fromMe:false});
const products=[
 {id:"six",name:"6 Piezas",price:14500,variants:null,modifiers:[]},
 {id:"burger",name:"Hamburguesa Crujiente",price:6800,variants:[{label:"Sencilla",price:6800}],modifiers:[{name:"Papas",required:false,minSelect:0,maxSelect:1,totalQuota:null,options:[{label:"Papas 120g",price:2000}]}]},
 {id:"coca",name:"Coca-Cola 600 ml",price:3500,variants:null,modifiers:[]},
].map(p=>productSchema.parse(p));
test("food additions and quantities cannot become the delivery recipient",()=>{
 for(const text of ["Y tres complementos chicos","También una hamburguesa cruji","Uno de cada uno","Dos purés","Quisiera una ensalada"])assert.equal(validRecipient(text),false,text);
 for(const text of ["Elena","Alfredo Hernández","Cliente Prueba"])assert.equal(validRecipient(text),true,text);
});
test("simultaneous product messages and location persist in order and emit only the final missing-data prompt",async t=>{
 const old={...process.env};Object.assign(process.env,{WHATSAPP_AI_ENABLED:"true",ANTHROPIC_API_KEY:"synthetic",WHATSAPP_BOT_ENABLED:"true"});t.after(()=>{process.env=old;});t.mock.method(globalThis,"fetch",async()=>{throw Error("No network");});
 const f=createSimulationFixture();f.app.prisma.product.findMany=async({where}:any)=>where?.id?.in?products.filter(p=>where.id.in.includes(p.id)):products;
 f.storage.set("store:location",JSON.stringify({lat:20.38,lng:-99.98}));f.storage.set("delivery:zones",JSON.stringify([{id:"test",name:"Prueba",minKm:0,maxKm:6,fee:6000,active:true,sortOrder:0}]));
 let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>entered=r),pending=new Promise<void>(r=>release=r);let calls=0;
 const bot=new WhatsAppBot(f.app,undefined,undefined,async c=>{
  const message=c.messages.at(-1)!;calls++;if(calls===1){entered();await pending;}
  const productId=message.includes("hamburguesa")?"burger":message.includes("Coca")?"coca":"six";
  return {action:"edit",question:"",operations:[{target:null,evidence:message,lines:[{productId,qty:1,variant:productId==="burger"?"Sencilla":null,modifiers:productId==="burger"?[{name:"Papas",option:"Papas 120g",qty:1}]:[]}]}]};
 });
 const inbox=new WhatsAppInbox(f.app,(i,defer)=>bot.handle(i,defer));const first=input("Quiero seis piezas");const processing=inbox.receive([first]);await started;
 await inbox.receive([input("También una hamburguesa cruji sencilla con papas"),input("Y una Coca de 600"),{...input(""),location:{lat:20.38,lng:-99.98}},input("Avenida Prueba 64, puerta azul"),input("4270000088 es el número de contacto"),input("A nombre de Cliente Prueba")]);
 assert.equal(f.queue.length,0);assert.equal(f.lists.get(inboxKeys(phone).queue)!.length,7);
 release();await processing;const key=`wa:bot:${phone}:session`;let s=JSON.parse(f.storage.get(key)!);
 assert.deepEqual(s.items.map((i:any)=>i.productId),["six","burger","coca"]);assert.equal(s.name,"Cliente Prueba");assert.equal(s.address,"Avenida Prueba 64, puerta azul");assert.equal(s.lat,20.38);assert.equal(s.deliveryPhone,phone);assert.equal(s.step,"notes");
 assert.equal(f.queue.length,1);assert.match(JSON.parse(f.queue[0]).params.text,/preparamos/);assert.doesNotMatch(JSON.parse(f.queue[0]).params.text,/ubicación|qué nombre|qué teléfono/);
 await inbox.receive([first]);assert.equal(calls,3);assert.equal(f.queue.length,1);
 await inbox.receive([input("sin notas"),input("efectivo"),input("exacto")]);s=JSON.parse(f.storage.get(key)!);assert.equal(s.total,32800);assert.equal(s.step,"confirm");assert.equal(f.creates(),0);
 await inbox.receive([{...input(""),buttonId:`wa_confirm:${s.checkoutId}:${s.confirmation.code}`}]);assert.equal(f.creates(),1);
});
test("failed processing retains the head and a new worker resumes without duplicate side effects",async t=>{
 const enabled=process.env.WHATSAPP_BOT_ENABLED;process.env.WHATSAPP_BOT_ENABLED="true";t.after(()=>{if(enabled===undefined)delete process.env.WHATSAPP_BOT_ENABLED;else process.env.WHATSAPP_BOT_ENABLED=enabled;});
 const f=createSimulationFixture(),seen=new Set<string>(),effects:string[]=[];let fail=true;
 const processMessage=async(i:ReturnType<typeof input>)=>{if(seen.has(i.id))return;seen.add(i.id);effects.push(i.text);if(fail){fail=false;throw Error("Simulated crash after commit");}};
 const first=input("first"),second=input("second");await assert.rejects(new WhatsAppInbox(f.app,processMessage).receive([first,second]));
 assert.equal(f.lists.get(inboxKeys(phone).queue)!.length,2);
 await new WhatsAppInbox(f.app,processMessage).recover();assert.deepEqual(effects,["first","second"]);assert.equal(f.lists.get(inboxKeys(phone).queue)!.length,0);
});
test("operator resume cannot replay queued messages from an older attention generation",async t=>{
 const enabled=process.env.WHATSAPP_BOT_ENABLED;process.env.WHATSAPP_BOT_ENABLED="true";t.after(()=>{if(enabled===undefined)delete process.env.WHATSAPP_BOT_ENABLED;else process.env.WHATSAPP_BOT_ENABLED=enabled;});
 const f=createSimulationFixture();const keys=inboxKeys(phone);f.storage.set(keys.lock,"other-worker");let calls=0;
 const inbox=new WhatsAppInbox(f.app,async()=>{calls++;});await inbox.receive([input("pedido anterior")]);f.storage.set(`wa:bot:${phone}:generation`,"1");f.storage.delete(keys.lock);await inbox.recover();assert.equal(calls,0);assert.equal(f.lists.get(keys.queue)!.length,0);
});
