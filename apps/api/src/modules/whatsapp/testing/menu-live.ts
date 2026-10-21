import { WhatsAppBot } from "../bot";
import { writeReply } from "../reply-writer";
import { createSimulationFixture } from "./fixture";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
if (!process.argv.includes("--live")) throw new Error("Requires --live");
async function main(){
 const f=createSimulationFixture();f.storage.set("store:config",JSON.stringify({...f.config,acceptOrders:false}));const bot=new WhatsAppBot(f.app);const results=[];
 for(const message of ["puedo ver tu menu","quiero ver el menu para mañana pedir"]){
 const authorized=await bot.advanceWithAI(null,{text:message,id:"synthetic",phone:"4270000001",fromMe:false});
 const reply=await writeReply({message,authoritativeReply:authorized.text,recent:[]});
 assert.match(reply,/https:\/\/wa.me\/c\//);assert.match(reply,/no estamos recibiendo pedidos/);assert.equal(f.creates(),0);results.push({message,reply});
 }
 writeFileSync("docs/testing/whatsapp-menu-live.json",JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}main();
