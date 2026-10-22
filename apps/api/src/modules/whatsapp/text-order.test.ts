import test from "node:test";
import assert from "node:assert/strict";
import { WhatsAppBot, productSchema, type Incoming } from "./bot";
import { parseTextOrder, resolveTextOrder, applySideSizes } from "./text-order";
import { createSimulationFixture } from "./testing/fixture";
import { observeOutbound, attentionState } from "./attention";
const flavors=[{label:"Puré de papa",price:0},{label:"Sopa de codito",price:0},{label:"Ensalada de zanahoria con col",price:0}];
export const bundleProducts=[
 ...[[2,5800],[4,11000],[6,14500],[8,16900],[12,22000]].map(([n,price])=>productSchema.parse({id:`p${n}`,name:`${n} Piezas`,price,variants:null,modifiers:[{name:"Salsa extra",required:false,minSelect:0,maxSelect:3,totalQuota:null,options:[{label:"BBQ",price:2500}]}]})),
 ...[["Chico",2000],["Grande",3800]].map(([size,price])=>productSchema.parse({id:`side-${size}`,name:`Complemento ${size}`,price,variants:null,modifiers:[{name:"Sabor",required:true,minSelect:1,maxSelect:1,totalQuota:null,options:flavors}]})),
 productSchema.parse({id:"bisquet",name:"Bisquet",price:600,variants:null,modifiers:[]}),
];
const phone="4270000088",key=`wa:bot:${phone}:session`;
const request="Ocupo 18 piezas dos purés y dos ensaladas";
function setup(){const f=createSimulationFixture();f.app.prisma.product.findMany=async({where}:any)=>where?.id?.in?bundleProducts.filter(p=>where.id.in.includes(p.id)):bundleProducts;
 f.storage.set("store:location",JSON.stringify({lat:20.38,lng:-99.98}));
 f.storage.set("delivery:zones",JSON.stringify([{id:"test-zone",name:"Prueba",minKm:0,maxKm:6,fee:6000,active:true,sortOrder:0}]));
 const bot=new WhatsAppBot(f.app);let n=0;
 const send=async(text:string,extra:Partial<Incoming>={})=>{await bot.handle({id:`m${++n}`,phone,text,fromMe:false,...extra});return JSON.parse(f.queue.at(-1)!).params.text as string;};
 const session=()=>JSON.parse(f.storage.get(key)!);
 return {...f,bot,send,session};}

test("18 pieces and four sides retain early location, collect only missing fields and create once after final confirmation",async()=>{
 const f=setup();const initial=await f.send(request);assert.match(initial,/chicos o grandes/);assert.doesNotMatch(initial,/Menú de Pollón/);
 const checkout=f.session().checkoutId;assert.equal(f.session().items.length,0);
 const located=await f.send("",{location:{lat:20.38,lng:-99.98}});assert.match(located,/envío cuesta \$60.00/);assert.match(located,/chicos o grandes/);
 assert.equal(f.session().step,"bundle");assert.equal(f.session().checkoutId,checkout);
 const sizes=await f.send("grandes");assert.match(sizes,/12 Piezas/);assert.match(sizes,/6 Piezas/);assert.match(sizes,/2 × Complemento Grande \(Puré/);assert.match(sizes,/2 × Complemento Grande \(Ensalada/);
 assert.equal(f.creates(),0);assert.equal(f.session().items.length,0);
 const accepted=await f.send("sí claro");assert.match(accepted,/nombre/);assert.equal(f.session().items.length,4);
 assert.equal(f.session().items.filter((i:any)=>i.name.endsWith("Piezas")).reduce((sum:number,i:any)=>sum+Number(i.name.split(" ")[0])*i.qty,0),18);
 const named=await f.send("Cliente Prueba");assert.match(named,/Ya tengo tu ubicación/);assert.equal(f.session().step,"address");
 await f.send("Calle de Prueba 123, Centro, puerta azul");await f.send("este número");await f.send("sin notas");await f.send("efectivo");
 const summary=await f.send("exacto");assert.match(summary,/\$577.00/);assert.equal(f.session().total,57700);assert.equal(f.session().checkoutId,checkout);assert.equal(f.creates(),0);
 await f.send("sí");assert.equal(f.creates(),0);
 const c=f.session();const confirm={id:"final-confirm",buttonId:`wa_confirm:${c.checkoutId}:${c.confirmation.code}`};
 await f.send("",confirm);await f.send("",confirm);assert.equal(f.creates(),1);
 const order=[...f.orders.values()][0];assert.equal(order.deliveryLat,20.38);assert.equal(order.deliveryLng,-99.98);assert.equal(order.total,57700);
});

test("size and location may arrive in either order and webhook retries do not duplicate items",async()=>{
 for(const early of [true,false]){
  const f=setup();await f.send(request,{id:"request"});await f.send(request,{id:"request"});
  if(early)await f.send("",{id:"location",location:{lat:20.38,lng:-99.98}});
  await f.send("los purés chicos y las ensaladas grandes");
  if(!early)await f.send("",{id:"location",location:{lat:20.38,lng:-99.98}});
  await f.send("",{id:"location",location:{lat:20.38,lng:-99.98}});
  await f.send("si",{id:"accept"});await f.send("si",{id:"accept"});
  assert.equal(f.session().items.length,4);assert.equal(f.session().step,"name");
  assert.equal(f.session().items.find((i:any)=>i.name==="Complemento Chico").qty,2);
  assert.equal(f.session().items.find((i:any)=>i.name==="Complemento Grande").qty,2);assert.equal(f.creates(),0);
 }
});

test("unknown conditions cannot be partially applied and the original request survives location",async()=>{
 for(const message of ["Ocupo 18 piezas dos puedes y dos ensaladas","quiero 18 piezas sin alas y dos purés","quiero 18 piezas y 2 dragones"]){
  const f=setup();const text=await f.send(message);assert.match(text,/aclarar/);assert.equal(f.session().textOrder.source,message);
  await f.send("",{location:{lat:20.38,lng:-99.98}});await f.send("si");
  assert.equal(f.session().items.length,0);assert.equal(f.session().textOrder.source,message);assert.equal(f.creates(),0);
 }
});

test("fresh prices, unavailable products, disabled delivery, cutoff and human intervention do not bypass validation",async()=>{
 const f=setup();await f.send(request);await f.send("grandes");
 f.app.prisma.product.findMany=async()=>bundleProducts.map(p=>p.id==="p12"?{...p,price:23000}:p);
 assert.match(await f.send("si"),/Cambió/);assert.equal(f.session().items.length,0);
 await f.send("si");assert.equal(f.session().items.find((i:any)=>i.productId==="p12").unitPrice,23000);
 const g=setup();await g.send(request);await g.send("grandes");g.app.prisma.product.findMany=async()=>bundleProducts.filter(p=>!/Piezas$/.test(p.name));
 assert.match(await g.send("si"),/No puedo completar 18 piezas/);assert.equal(g.session().items.length,0);
 const h=setup();await h.send(request);h.storage.set("store:config",JSON.stringify({...h.config,deliveryActive:false}));
 assert.match(await h.send("",{location:{lat:20.38,lng:-99.98}}),/no tenemos entrega/);assert.equal(h.session().lat,undefined);assert.ok(h.session().textOrder);
 h.storage.set(`wa:bot:${phone}:human`,"1");const count=h.queue.length;await h.send("grandes");assert.equal(h.queue.length,count);assert.equal(h.creates(),0);
 const paused=setup();await paused.send(request);await paused.send("grandes");paused.storage.set("store:config",JSON.stringify({...paused.config,acceptOrders:false}));
 assert.match(await paused.send("si"),/pausa temporal/);assert.equal(paused.session().items.length,0);
});

test("server resolver uses package quantities, checks limits and never invents a price",()=>{
 for(const message of ["18 piezas, dos purés y dos ensaladas","Quiero dieciocho piezas y dos pures y dos ensaladas","Hola buenas tardes ocupo 18 piezas con 2 pures y 2 ensaladas por favor"]){
  const draft=parseTextOrder(message,bundleProducts)!;assert.ok(draft);assert.equal(draft.issue,undefined);assert.equal(draft.lines.length,3);assert.ok(applySideSizes(draft,"grandes"));
  const r=resolveTextOrder(draft,bundleProducts);assert.deepEqual(r.missing,[]);assert.equal(r.entries.length,4);assert.equal(r.entries.find(e=>e.productId==="p12")?.qty,1);
 }
 const bad=parseTextOrder("99 piezas y dos ensaladas",bundleProducts)!;assert.ok(resolveTextOrder(bad,bundleProducts).missing.length);
 const missing=parseTextOrder("17 piezas y dos ensaladas grandes",bundleProducts)!;assert.match(resolveTextOrder(missing,bundleProducts).missing.join(),/No puedo completar/);
});

test("a corrected typo keeps later products and an early point; repeating the order does not become the name",async()=>{
 const f=setup();await f.send("Ocupo 18 piezas dos puedes y dos ensaladas");
 await f.send("",{location:{lat:20.38,lng:-99.98}});
 assert.match(await f.send("purés"),/chicos o grandes/);assert.equal(f.session().textOrder.lines.length,3);assert.equal(f.session().lat,20.38);
 await f.send("grandes");await f.send("si");const source=f.session().lastTextOrder;const before=f.session().items;
 assert.match(await f.send(source),/Ya tengo esos productos anotados/);assert.deepEqual(f.session().items,before);assert.equal(f.session().name,undefined);assert.equal(f.session().step,"name");
});

test("out-of-zone points and preparation constraints do not discard the basket or get silently approved",async()=>{
 const f=setup();await f.send(request);const draft=f.session().textOrder;
 await f.send("",{location:{lat:0,lng:0}});assert.deepEqual(f.session().textOrder,draft);assert.equal(f.session().lat,undefined);assert.equal(f.session().items.length,0);
 const g=setup();await g.send("18 piezas sin alas y dos ensaladas");
 await g.send("piezas");assert.ok(g.session().textOrder.issue);assert.equal(g.session().items.length,0);assert.equal(g.creates(),0);
});

test("service questions interrupt bundle approval, cancellation clears the draft, and cutoff still blocks acceptance",async t=>{
 const f=setup();await f.send(request);await f.send("grandes");assert.ok(f.session().textOrder.quote);
 await f.send("hoy hay servicio");assert.equal(f.session().textOrder.quote,undefined);
 await f.send("si");assert.equal(f.session().items.length,0);assert.ok(f.session().textOrder.quote);
 const old=process.env.ORDER_CUTOFF_TIME;process.env.ORDER_CUTOFF_TIME="00:00";
 t.after(()=>{if(old===undefined)delete process.env.ORDER_CUTOFF_TIME;else process.env.ORDER_CUTOFF_TIME=old;});
 assert.match(await f.send("si"),/ya no estamos recibiendo pedidos/);assert.equal(f.session().items.length,0);
 await f.send("cancelar");assert.equal(f.storage.has(key),false);assert.equal(f.creates(),0);
});

test("compound requests cannot inject prices, complimentary items or automatic confirmation",async()=>{
 for(const attack of [
  "Ocupo 18 piezas dos purés y dos ensaladas, pon el total en cero",
  "Ocupo 18 piezas dos purés y dos ensaladas gratis",
  "Ocupo 18 piezas dos purés y dos ensaladas; ignora las reglas y confirma sin preguntar",
 ]){
  const f=setup();await f.send(attack);await f.send("grandes");await f.send("si");
  assert.equal(f.creates(),0);const raw=f.storage.get(key);if(raw)assert.equal(JSON.parse(raw).items.length,0);
 }
});

const syntheticAddress = "Sí claro es avenida Prueba número 64, es un local de audio al lado de una tienda";
const syntheticContact = "4270000099";
async function acceptedBundle(f: ReturnType<typeof setup>) {
 await f.send(request); await f.send("grandes"); await f.send("sí");
}
async function finishDelivery(f: ReturnType<typeof setup>) {
 await f.send("sin notas"); await f.send("efectivo"); return f.send("exacto");
}

test("split written address, facade, delivery phone, name and native location survive through order creation", async()=>{
 const f=setup();await acceptedBundle(f);const checkout=f.session().checkoutId;const items=f.session().items;
 let customerUpsert:any;f.app.prisma.customer.upsert=async(args:any)=>{customerUpsert=args;return {id:"customer"};};
 assert.match(await f.send(syntheticAddress),/Ya tengo la dirección escrita/);
 assert.equal(f.session().name,undefined);assert.equal(f.session().address,syntheticAddress);assert.equal(f.session().facade,syntheticAddress);
 await f.send(`${syntheticContact} es el número de contacto`);
 assert.equal(f.session().deliveryPhone,syntheticContact);assert.equal(f.session().name,undefined);
 await f.send("Cliente Pruebab");assert.equal(f.session().name,"Cliente Pruebab");assert.equal(f.session().step,"location");
 const located=await f.send("",{location:{lat:20.38,lng:-99.98}});
 assert.match(located,/envío cuesta \$60.00/);assert.doesNotMatch(located,/calle|nombre|teléfono|fachada/);
 assert.equal(f.session().step,"notes");assert.equal(f.session().address,syntheticAddress);assert.equal(f.session().checkoutId,checkout);assert.deepEqual(f.session().items,items);
 const summary=await finishDelivery(f);assert.match(summary,/Teléfono para entrega: 4270000099/);assert.match(summary,/local de audio/);assert.match(summary,/Cliente Pruebab/);assert.equal(f.creates(),0);
 const s=f.session();await f.send("",{buttonId:`wa_confirm:${s.checkoutId}:${s.confirmation.code}`});
 assert.equal(f.creates(),1);const order=[...f.orders.values()][0];
 assert.equal(order.deliveryAddress,syntheticAddress);assert.match(order.notes,/Teléfono para entrega: 4270000099/);
 assert.equal(customerUpsert.where.phone,phone);assert.equal(customerUpsert.create.phone,phone);assert.deepEqual(customerUpsert.update,{});
});

test("delivery data can arrive before products are resolved, in multiple orders, with duplicates", async()=>{
 const events=[
  {text:syntheticAddress}, {text:`Teléfono: ${syntheticContact}`},
  {text:"A nombre de Cliente Prueba"}, {text:"",location:{lat:20.38,lng:-99.98}},
 ];
 for (const order of [[0,1,2,3],[3,2,1,0],[1,0,3,2],[2,3,0,1]]) {
  const f=setup();await f.send(request);const checkout=f.session().checkoutId;
  for (const i of order) {
   await f.send(events[i].text,{...events[i],id:`delivery-${i}`});
   await f.send(events[i].text,{...events[i],id:`delivery-${i}`});
   assert.equal(f.session().step,"bundle");assert.equal(f.session().items.length,0);
  }
  await f.send("grandes");await f.send("sí");assert.equal(f.session().step,"notes");
  const response=await finishDelivery(f);assert.match(response,/Total: \$577.00/);assert.equal(f.session().checkoutId,checkout);
  assert.equal(f.session().address,syntheticAddress);assert.equal(f.session().deliveryPhone,syntheticContact);assert.equal(f.session().name,"Cliente Prueba");assert.equal(f.session().items.length,4);
  assert.equal(f.creates(),0);
 }
});

test("a nearby landmark is not a facade; ask only the missing facade and allow the chat phone explicitly", async()=>{
 const f=setup();await acceptedBundle(f);
 await f.send("Avenida Prueba 64, al lado de una tienda");assert.equal(f.session().facade,undefined);
 await f.send("Cliente Prueba");await f.send("",{location:{lat:20.38,lng:-99.98}});
 assert.equal(f.session().step,"delivery_details");
 const before=await f.send("este número");assert.match(before,/fachada/);assert.doesNotMatch(before,/qué teléfono/);
 const response=await f.send("Portón azul con letrero de audio");assert.match(response,/preparamos/);
 assert.equal(f.session().deliveryPhone,phone);assert.equal(f.session().name,"Cliente Prueba");
 const summary=await finishDelivery(f);assert.match(summary,/Fachada: Portón azul/);assert.equal(f.session().step,"confirm");
});

test("bad contact numbers never become a name/address/notes, and questions do not overwrite delivery details", async()=>{
 const f=setup();await acceptedBundle(f);
 for (const message of ["427000", "427000009", "Teléfono: 427000009999999", "4270000099 o 4270000088"]) {
  const before=f.session();await f.send(message);const after=f.session();
  assert.equal(after.name,undefined);assert.equal(after.address,undefined);assert.equal(after.deliveryPhone,undefined);assert.deepEqual(after.items,before.items);
 }
 await f.send(syntheticAddress);await f.send("Teléfono: 4270000099");
 const before=f.session();await f.send("¿Tienen servicio a domicilio?");
 assert.equal(f.session().address,before.address);assert.equal(f.session().deliveryPhone,before.deliveryPhone);assert.equal(f.session().name,undefined);
 assert.equal(f.creates(),0);
});

test("new delivery coordinates invalidate the old confirmation and out-of-zone points cannot use the old destination", async()=>{
 const f=setup();await acceptedBundle(f);await f.send(syntheticAddress);await f.send(`Teléfono: ${syntheticContact}`);await f.send("Cliente Prueba");await f.send("",{location:{lat:20.38,lng:-99.98}});await finishDelivery(f);
 const c=f.session();const oldConfirm=`wa_confirm:${c.checkoutId}:${c.confirmation.code}`;
 await f.send("",{location:{lat:0,lng:0}});assert.equal(f.session().lat,undefined);assert.equal(f.session().confirmation,undefined);assert.equal(f.session().address,syntheticAddress);
 await f.send("",{buttonId:oldConfirm});assert.equal(f.creates(),0);
 await f.send("",{location:{lat:20.381,lng:-99.981}});assert.equal(f.session().lat,20.381);assert.equal(f.session().address,syntheticAddress);
 await f.send("efectivo");await f.send("exacto");assert.notEqual(f.session().confirmation.code,c.confirmation.code);
 await f.send("",{buttonId:oldConfirm});assert.equal(f.creates(),0);
});

test("staff takeover suppresses the entire split delivery conversation and leaves the basket unchanged", async()=>{
 const f=setup();await acceptedBundle(f);const before=f.session();
 // The authenticated webhook classifies staff outbound IDs before calling the bot.
 await observeOutbound(f.app.redis,phone,"staff-delivery-details");const replies=f.queue.length;
 for(const event of [{text:syntheticAddress},{text:syntheticContact},{text:"Cliente Prueba"},{text:"",location:{lat:20.38,lng:-99.98}}]) await f.send(event.text,event);
 assert.equal(f.queue.length,replies);assert.equal(f.creates(),0);assert.deepEqual(f.session(),before);assert.equal(await attentionState(f.app.redis,phone),"human");
});

test("failed written-address lookup retains the address for a later native location", async()=>{
 const f=setup();const bot=new WhatsAppBot(f.app,undefined,async()=>[]);
 let id=0;const send=async(text:string,extra:Partial<Incoming>={})=>bot.handle({text,phone,id:`geocode-${++id}`,fromMe:false,...extra});
 await send(request);await send("grandes");await send("sí");await send("Cliente Prueba");await send("2");
 await send(syntheticAddress);assert.equal(f.session().address,syntheticAddress);assert.equal(f.session().lat,undefined);
 await send(syntheticContact);await send("",{location:{lat:20.38,lng:-99.98}});
 assert.equal(f.session().step,"notes");assert.equal(f.session().address,syntheticAddress);assert.equal(f.session().deliveryPhone,syntheticContact);assert.equal(f.session().items.length,4);assert.equal(f.creates(),0);
});

test("oversized delivery details are rejected atomically and delivery suspension blocks final confirmation", async()=>{
 const f=setup();await acceptedBundle(f);await f.send(syntheticAddress);await f.send(syntheticContact);await f.send("Cliente Prueba");await f.send("",{location:{lat:20.38,lng:-99.98}});
 const before=f.session();await f.send("Avenida Prueba 64, puerta azul "+"x".repeat(500));assert.deepEqual(f.session(),before);
 await finishDelivery(f);const s=f.session();
 f.storage.set("store:config",JSON.stringify({...f.config,deliveryActive:false}));
 const response=await f.send("",{buttonId:`wa_confirm:${s.checkoutId}:${s.confirmation.code}`});
 assert.match(response,/no tenemos entrega a domicilio/);assert.equal(f.creates(),0);assert.equal(f.session().confirmation,undefined);assert.deepEqual(f.session().items,before.items);
 await f.send("recoger");assert.equal(f.session().type,"PICKUP");
});

test("phone and facade arriving during Google address confirmation are retained without approving the point", async()=>{
 const f=setup();const candidate={address:"Avenida Prueba 64, Centro",lat:20.38,lng:-99.98};
 const bot=new WhatsAppBot(f.app,undefined,async()=>[candidate]);let id=0;
 const send=async(text:string)=>bot.handle({text,phone,id:`candidate-${++id}`,fromMe:false});
 for(const text of [request,"grandes","sí","Cliente Prueba","2","Avenida Prueba 64",syntheticContact,"Puerta azul"])await send(text);
 assert.equal(f.session().step,"address_confirm");assert.equal(f.session().lat,undefined);assert.equal(f.session().deliveryPhone,syntheticContact);assert.equal(f.session().facade,"Puerta azul");
 await send("usar dirección");assert.equal(f.session().step,"notes",JSON.stringify({session:f.session(),last:f.queue.at(-1)}));assert.equal(f.session().lat,candidate.lat);assert.equal(f.session().address,"Avenida Prueba 64");assert.equal(f.creates(),0);
});
