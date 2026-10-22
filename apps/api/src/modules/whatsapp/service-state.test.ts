import test from "node:test";
import assert from "node:assert/strict";
import { evaluateStoreAvailability } from "../admin/store-config.service";
import { answerQuestion, renderCurrentService, isQuestion } from "./questions";
import { protect, restore } from "./reply-writer";
import { createSimulationFixture } from "./testing/fixture";
import { WhatsAppBot, type Session } from "./bot";
const config={isOpen:true,acceptOrders:true,deliveryActive:true,openDays:[0,1,3,4,5,6],openTime:"10:00",closeTime:"19:00"};
const date=(time:string,day=21)=>new Date(`2026-10-${day}T${time}:00-06:00`);

test("state matrix distinguishes opening, pause, cutoff, closing and days off at every minute boundary",t=>{
 const old=process.env.ORDER_CUTOFF_TIME; process.env.ORDER_CUTOFF_TIME="18:40";
 t.after(()=>{if(old===undefined)delete process.env.ORDER_CUTOFF_TIME;else process.env.ORDER_CUTOFF_TIME=old;});
 let count=0;
 for(const day of [19,20,21,22,23,24,25]) for(const isOpen of [true,false]) for(const acceptOrders of [true,false]) for(const time of ["00:00","09:59","10:00","11:31","18:30","18:39","18:40","18:41","18:59","19:00","23:59"]){
  const c={...config,isOpen,acceptOrders}; const now=date(time,day);const state=evaluateStoreAvailability(c,now);const reply=renderCurrentService(c,now);
  const expected=!isOpen||day===20?"day":time<"10:00"?"before":time>="19:00"?"hours":time>="18:40"?"cutoff":!acceptOrders?"paused":"open";
  assert.equal(state.accepting,expected==="open",`${day} ${time} ${isOpen}/${acceptOrders}`);
  if(expected!=="before"&&expected!=="open")assert.equal(state.closure,expected);
  if(expected==="paused"){assert.match(reply,/pausa temporal/);assert.doesNotMatch(reply,/no tenemos servicio|ya cerramos|cerrado por hoy/);}
  if(expected==="open")assert.match(reply,/Estamos tomando pedidos/);
  assert.doesNotMatch(reply,/18:40|6:40/);count++;
 }
 assert.equal(count,308);
});

test("the reported greeting and unpunctuated status questions work even with AI down",async()=>{
 const f=createSimulationFixture();f.storage.set("store:config",JSON.stringify({...config,acceptOrders:false}));
 const questions=["Hoy tendrán servicio?","hoy tendran servicio","si hay servicio hoy","ya puedo pedir","siguen abiertos","entonces hoy no abren","y ahorita hay servicio","hoy ay servicio","Buenas tardes tienes servicio el día de hoy","Hola, tienes servicio hoy","Buenas noches tienen servicio el dia de hoy","buenos dias hay servicio hoy"];
 for(const q of questions){
  assert.equal(isQuestion(q),true,q);
  const reply=await answerQuestion(f.app,q,[],async()=>{throw Error("AI must not be required for current status");},date("11:31"));
  assert.match(reply!,/pausa temporal/,q);assert.doesNotMatch(reply!,/hoy no tenemos servicio|no es día de servicio|cerrado por hoy/);
 }
 f.storage.set("store:config",JSON.stringify(config));
 const reopened=await answerQuestion(f.app,"ya puedo pedir",[{customer:"hola",reply:"Hoy no tenemos servicio."}],async()=>null,date("12:16"));
 assert.match(reopened!,/Estamos tomando pedidos/);assert.doesNotMatch(reopened!,/pausa|cerrado/);assert.equal(f.creates(),0);
});

test("today never quotes an open schedule over an explicit closure; tomorrow remains conditional",async()=>{
 const f=createSimulationFixture();f.storage.set("store:config",JSON.stringify({...config,isOpen:false}));
 const today=await answerQuestion(f.app,"hoy hay servicio",[],async()=>null,date("11:31"));
 assert.match(today!,/cerrado por hoy/);assert.doesNotMatch(today!,/hay servicio de/);
 const tomorrow=await answerQuestion(f.app,"¿y mañana?",[],async()=>({topics:["hours"],productIds:[],day:"tomorrow",detail:"general"}),date("11:31"));
 assert.match(tomorrow!,/según el horario habitual/);assert.match(tomorrow!,/depende del estado/);
});

test("delivery during pause does not imply orders are accepted, and menu stays available",async()=>{
 const f=createSimulationFixture();f.storage.set("store:config",JSON.stringify({...f.config,acceptOrders:false}));
 const reply=await answerQuestion(f.app,"¿Tienen domicilio?",[],async()=>({topics:["delivery"],productIds:[],day:"schedule",detail:"general"}),date("11:31"));
 assert.match(reply!,/pausa temporal/);assert.match(reply!,/cobertura/);
 const menu=await new WhatsAppBot(f.app).advance(null,{id:"menu",phone:"4270000001",text:"ver menu",fromMe:false});
 assert.match(menu.text,/wa.me\/c/);assert.match(menu.text,/pausa temporal/);assert.equal(f.creates(),0);
});

test("pause during confirmation invalidates the old button and explicitly says no order was registered",async()=>{
 const f=createSimulationFixture();f.storage.set("store:config",JSON.stringify({...f.config,acceptOrders:false}));
 const bot=new WhatsAppBot(f.app);const s:Session={step:"confirm",checkoutId:"pending",catalog:[],items:[],confirmation:{code:"TEST",expiresAt:Date.now()+600000}};
 const result=await bot.advance(s,{id:"confirm",phone:"4270000001",text:"",buttonId:"wa_confirm:pending:TEST",fromMe:false});
 assert.match(result.text,/pausa temporal/);assert.match(result.text,/no quedó registrado/);assert.equal(result.session?.confirmation,undefined);assert.equal(f.creates(),0);
});

test("AI prose cannot append a full-day closure or a reopening promise to a pause",()=>{
 const original=renderCurrentService({...config,acceptOrders:false},date("11:31"));const p=protect(original);const markers=p.lines.map((_,i)=>`[[P${i}]]`).join("\n");
 for(const addition of ["Hoy no tenemos servicio.","Estamos cerrados.","En breve regresamos.","Pronto puedes pedir.","Te aviso cuando abramos.","Ya estamos recibiendo pedidos."]){assert.equal(restore(markers+"\n"+addition,original,p.lines),null,addition);}
 assert.equal(restore("Entiendo la molestia.\n"+markers,original,p.lines),"Entiendo la molestia.\n"+original);
});

test("full handler persists invalidated confirmations without crashing or sending a stale button",async()=>{
 for(const reason of [{acceptOrders:false},{isOpen:false}]){
  const f=createSimulationFixture();f.storage.set("store:config",JSON.stringify({...f.config,...reason}));
  const phone="4270000001",key=`wa:bot:${phone}:session`;
  f.storage.set(key,JSON.stringify({step:"confirm",checkoutId:"pending",items:[],catalog:[],confirmation:{code:"TEST",expiresAt:Date.now()+600000}}));
  const bot=new WhatsAppBot(f.app);
  await bot.handle({id:"old-confirm",phone,text:"",buttonId:"wa_confirm:pending:TEST",fromMe:false});
  const stored=JSON.parse(f.storage.get(key)!);assert.equal(stored.confirmation,undefined);assert.equal(f.creates(),0);
  assert.equal(f.queue.length,1);assert.equal(JSON.parse(f.queue[0]).confirmation,undefined);
  await bot.handle({id:"old-confirm",phone,text:"",buttonId:"wa_confirm:pending:TEST",fromMe:false});
  assert.equal(f.queue.length,1);
 }
});

test("pause and reopening preserve drafts at every stage and require a fresh summary",async()=>{
 const steps=["menu","quantity","more","name","type","notes","payment","cash","confirm"] as const;
 const path=["pedir","1","1","listo","Cliente Prueba","1","sin notas","efectivo","exacto"];
 for(const [index,step] of steps.entries()){
  const f=createSimulationFixture();const bot=new WhatsAppBot(f.app,async()=>null);const phone="4270000001";
  for(const [n,text] of path.slice(0,index+1).entries())await bot.handle({id:`start-${n}`,phone,text,fromMe:false});
  const key=`wa:bot:${phone}:session`;const draft=JSON.parse(f.storage.get(key)!);assert.equal(draft.step,step);
  f.storage.set("store:config",JSON.stringify({...f.config,acceptOrders:false}));
  const initialCount=f.queue.length;
  await bot.handle({id:"paused",phone,text:"hola",fromMe:false});
  const paused=JSON.parse(f.storage.get(key)!);assert.equal(paused.step,step);assert.equal(paused.checkoutId,draft.checkoutId);assert.deepEqual(paused.items,draft.items);
  assert.match(JSON.parse(f.queue[initialCount]).params.text,/pausa temporal/);assert.equal(f.creates(),0);
  f.storage.set("store:config",JSON.stringify(f.config));
  await bot.handle({id:"reopened",phone,text:"ya puedo pedir",fromMe:false});
  assert.match(JSON.parse(f.queue.at(-1)!).params.text,/Estamos tomando pedidos/);assert.equal(f.creates(),0);
  if(step==="confirm"){
   await bot.handle({id:"stale",phone,text:"",buttonId:`wa_confirm:${draft.checkoutId}:${draft.confirmation.code}`,fromMe:false});
   assert.equal(f.creates(),0);const revised=JSON.parse(f.storage.get(key)!);assert.ok(revised.confirmation);assert.notEqual(revised.confirmation.code,draft.confirmation.code);
   assert.match(JSON.parse(f.queue.at(-1)!).params.text,/Revisa los datos actualizados/);
  }
 }
});

test("promotion questions never become mere product selection or invented discounts",async()=>{
 const f=createSimulationFixture();
 for(const q of ["¿tienen dos por uno o descuentos?","¿Hay promociones?","¿Cuánto cuesta el pollo y hay promo?"]){
  const mixed=q.includes("pollo");
  const reply=await answerQuestion(f.app,q,[],async()=>({topics:["products"],productIds:mixed?["pollo"]:[],day:"schedule",detail:"price"}),date("11:31"));
  assert.match(reply!,/promoción confirmada/);assert.match(reply!,/ASESOR/);assert.doesNotMatch(reply!,/De qué producto quieres/);
  if(mixed)assert.match(reply!,/150.00/);assert.equal(f.creates(),0);
 }
 const combined=await answerQuestion(f.app,"¿Qué horarios tienen y entregan a domicilio?",[],async()=>({topics:["hours","delivery"],productIds:[],day:"schedule",detail:"general"}),date("11:31"));
 assert.ok(combined);
 f.storage.set("store:config",JSON.stringify({...config,acceptOrders:false}));
 const paused=await answerQuestion(f.app,"¿Qué horarios tienen y entregan a domicilio?",[],async()=>({topics:["hours","delivery"],productIds:[],day:"schedule",detail:"general"}),date("11:31"));
 assert.match(paused!,/10:00/);assert.match(paused!,/pausa temporal/);
});

test("pause followups address the question instead of repeating the same closure paragraph",()=>{
 const c={...config,acceptOrders:false};const now=date("11:31");const greeting=renderCurrentService(c,now);
 const followup=renderCurrentService(c,now,"Hoy tendrán servicio?",[{customer:"hola",reply:greeting}]);
 const mistakenDay=renderCurrentService(c,now,"¿Entonces hoy ya no van a abrir?");
 const resumption=renderCurrentService(c,now,"¿Cuándo vuelven?");
 assert.match(followup,/Seguimos en pausa temporal/);
 assert.match(mistakenDay,/no significa que se haya cancelado/);
 assert.match(resumption,/no tenemos una hora de reanudación confirmada/);
 assert.equal(new Set([greeting,followup,mistakenDay,resumption]).size,4);
 assert.match(renderCurrentService(c,now,"¿a qué hora cierran hoy?"),/19:00/);
});
