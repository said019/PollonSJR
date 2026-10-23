import assert from "node:assert/strict";
import test from "node:test";
import { WhatsAppBot,productSchema } from "./bot";
import { createSimulationFixture } from "./testing/fixture";
import { resolveCatalog } from "./catalog";
import { readPublicCatalog } from "./public-catalog";
const chicken=productSchema.parse({id:"six",name:"6 Piezas",price:14500,variants:null,modifiers:[]});
const side=productSchema.parse({id:"side",name:"Complemento Chico",price:2000,variants:null,modifiers:[{name:"Sabor",required:true,minSelect:1,maxSelect:1,totalQuota:null,options:[{label:"Puré de papa",price:0},{label:"Sopa de codito",price:0},{label:"Ensalada de zanahoria con col",price:0}]}]});
const input=(text:string)=>({id:crypto.randomUUID(),phone:"4270000088",fromMe:false,text});
const cart={sellerJid:"5214428219534@s.whatsapp.net",itemCount:4,lines:[{id:"8332872696748532",quantity:1},{id:"7399986960082668",quantity:3}]};
function fixture(){const f=createSimulationFixture();f.app.prisma.product.findMany=async()=>[chicken,side];
 f.links.push({externalId:cart.lines[0].id,productId:"six",variant:null},{externalId:cart.lines[1].id,productId:"side",variant:null});
 return {f,bot:new WhatsAppBot(f.app)};}
test("four native cart units retain quantity, accept one of each side and reach panel exactly once on confirmation",async()=>{
 const {f,bot}=fixture();
 let s=(await bot.advanceWithAI(null,{...input(""),catalogSelection:cart})).session!;
 assert.equal(s.step,"modifier");assert.equal(s.pending!.qty,3);assert.equal(s.items[0].productId,"six");
 const checkout=s.checkoutId;
 s=(await bot.advanceWithAI(s,input("De complementos serían uno de cada uno"))).session!;
 assert.equal(s.step,"name");assert.equal(s.items.length,4);
 assert.deepEqual(s.items.slice(1).map(i=>i.modifiers[0].option),side.modifiers[0].options.map(o=>o.label));
 for(const text of ["Cliente Prueba","recoger","sin notas","efectivo","exacto"])s=(await bot.advanceWithAI(s,input(text))).session!;
 assert.equal(s.total,20500);assert.equal(s.checkoutId,checkout);assert.equal(f.creates(),0);
 const confirm={...input(""),buttonId:"wa_confirm:"+s.checkoutId+":"+s.confirmation!.code};
 const before=structuredClone(s);await bot.advanceWithAI(s,confirm);await bot.advanceWithAI(before,confirm);
 assert.equal(f.creates(),1);
 const order=[...f.orders.values()][0];assert.equal(order.total,20500);assert.equal(order.items.create.length,4);
});
test("cart preserves previously collected delivery details and asks only pending fields",async()=>{
 const {f,bot}=fixture();
 let s=(await bot.advanceWithAI(null,input("Hacer un pedido"))).session!;
 Object.assign(s,{name:"Cliente Prueba",type:"DELIVERY",address:"Calle Prueba 64",facade:"Portón negro",deliveryPhone:"4270000088",lat:20.38,lng:-99.99});
 s=(await bot.advanceWithAI(s,{...input(""),catalogSelection:cart})).session!;
 s=(await bot.advanceWithAI(s,input("uno de cada uno"))).session!;
 assert.equal(s.step,"notes");assert.equal(s.address,"Calle Prueba 64");assert.equal(s.items.length,4);assert.equal(f.creates(),0);
});
test("incomplete cart, foreign seller and unknown article never become partial orders",async()=>{
 const {f}=fixture();
 await assert.rejects(resolveCatalog(f.app,{...cart,itemCount:5}),/incompleto/);
 await assert.rejects(resolveCatalog(f.app,{...cart,sellerJid:"5211111111111@s.whatsapp.net"}),/otro negocio/);
 await assert.rejects(resolveCatalog(f.app,{...cart,lines:[...cart.lines,{id:"unknown",quantity:1}],itemCount:5}),/sin vincular/);
});
test("one of each never exceeds quantity or invents options",async()=>{
 const {bot}=fixture();
 let s=(await bot.advanceWithAI(null,{...input(""),catalogSelection:{...cart,itemCount:3,lines:[cart.lines[0],{...cart.lines[1],quantity:2}]}})).session!;
 const before=structuredClone(s.pending);
 s=(await bot.advanceWithAI(s,input("uno de cada uno"))).session!;
 assert.deepEqual(s.pending,before);
});
test("public catalog reads all pages, rejects repeated cursors and never sends private credentials",async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 let calls=0;
 globalThis.fetch=async(_url,init)=>{
 const body=JSON.parse(String(init?.body));assert.equal(body.variables.request.product_catalog.jid,cart.sellerJid);
 assert.equal((init?.headers as any).apikey,undefined);calls++;
 return new Response(JSON.stringify({data:{xwa_product_catalog_get_product_catalog:{product_catalog:{products:[{id:String(calls),name:"Product "+calls}],paging:{after:calls===1?"next":""}}}}}),{status:200});
 };
 assert.equal((await readPublicCatalog(cart.sellerJid)).length,2);assert.equal(calls,2);
 globalThis.fetch=async()=>new Response(JSON.stringify({data:{xwa_product_catalog_get_product_catalog:{product_catalog:{products:[],paging:{after:"same"}}}}}),{status:200});
 await assert.rejects(readPublicCatalog(cart.sellerJid),/repetida/);
});
test("a separate addition after native options retains the checkout and previously collected data",async()=>{
 const {f,bot}=fixture();
 const soda=productSchema.parse({id:"soda",name:"Coca-Cola 600 ml",price:3500,variants:null,modifiers:[]});
 f.app.prisma.product.findMany=async()=>[chicken,side,soda];
 let s=(await bot.advanceWithAI(null,{...input(""),catalogSelection:cart})).session!;
 s=(await bot.advanceWithAI(s,input("uno de cada uno"))).session!;
 const checkout=s.checkoutId;
 s=(await bot.advanceWithAI(s,input("Y una coca de 600 por favor"))).session!;
 assert.equal(s.step,"name");assert.equal(s.items.length,5);assert.equal(s.checkoutId,checkout);
 for(const text of ["Cliente Prueba","recoger","sin notas","efectivo","exacto"])s=(await bot.advanceWithAI(s,input(text))).session!;
 assert.equal(s.total,24000);assert.equal(f.creates(),0);
});
