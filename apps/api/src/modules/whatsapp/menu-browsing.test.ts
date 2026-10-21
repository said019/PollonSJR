import test from "node:test";
import assert from "node:assert/strict";
import { WhatsAppBot, type Session } from "./bot";
import { createSimulationFixture } from "./testing/fixture";
test("menu browsing remains read-only while closed, paused, after cutoff or during a draft", async t => {
 const old = process.env.ORDER_CUTOFF_TIME;
 t.after(()=>{if(old===undefined)delete process.env.ORDER_CUTOFF_TIME;else process.env.ORDER_CUTOFF_TIME=old;});
 for(const config of [{isOpen:false},{acceptOrders:false},{}]) {
  const f=createSimulationFixture();f.storage.set("store:config",JSON.stringify({...f.config,...config}));
  process.env.ORDER_CUTOFF_TIME="00:00";
  const bot=new WhatsAppBot(f.app);
  for(const text of ["puedo ver tu menu","quiero ver el menu para mañana pedir","menú","¿Me muestras el catálogo?"]) {
   const result=await bot.advanceWithAI(null,{text,id:"test",phone:"4270000001",fromMe:false});
   assert.match(result.text,/wa.me\/c\//);assert.match(result.text,/Pollo/);assert.match(result.text,/no estamos recibiendo pedidos/);assert.doesNotMatch(result.text,/00:00|18:40|6:40|mañana abrimos/);assert.equal(result.session,null);assert.equal(f.creates(),0);
  }
  const session:Session={step:"quantity",checkoutId:"draft",catalog:[],items:[]};const before=JSON.stringify(session);
  await bot.advanceWithAI(session,{text:"puedo ver tu menu",id:"draft",phone:"4270000001",fromMe:false});assert.equal(JSON.stringify(session),before);
  const human={...session,step:"human" as const};assert.equal((await bot.advanceWithAI(human,{text:"menu",id:"human",phone:"4270000001",fromMe:false})).text,"");
 }
});
