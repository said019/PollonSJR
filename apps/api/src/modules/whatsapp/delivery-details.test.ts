import test from "node:test";
import assert from "node:assert/strict";
import { parseDeliveryDetails, deliveryAddress, orderNotes } from "./delivery-details";
const phone="4270000088";

test("labelled delivery data can be combined without dropping fields or changing spelling",()=>{
 const text="Dirección: Avenida Pruebab número 64, local de audio\nTeléfono: +52 427 000 0099\nNombre: Cliente Pruebab";
 const result=parseDeliveryDetails(text,"name",phone)!;
 assert.equal(result.address,"Dirección: Avenida Pruebab número 64, local de audio");
 assert.equal(result.facade,result.address);assert.equal(result.phone,"4270000099");assert.equal(result.name,"Cliente Pruebab");
 assert.equal(parseDeliveryDetails(text+"\nNo cambies mi pedido","name",phone),null);
 assert.match(parseDeliveryDetails("Teléfono: 4270000099\nTeléfono: 4270000077","name",phone)!.error!,/dos datos distintos/);
});

test("phone formats, missing street number, references and names cannot cross fields",()=>{
 for(const text of ["4270000099","(427) 000-0099","5214270000099","4270000099 es el número de contacto"])
  assert.deepEqual(parseDeliveryDetails(text,"name",phone),{phone:"4270000099"});
 assert.deepEqual(parseDeliveryDetails("este mismo número","delivery_details",phone),{phone});
 assert.equal(parseDeliveryDetails("Avenida Prueba","name",phone)?.address,undefined);
 assert.equal(parseDeliveryDetails("Avenida Prueba sin número","name",phone)?.address,"Avenida Prueba sin número");
 assert.deepEqual(parseDeliveryDetails("Puerta azul","name",phone),{facade:"Puerta azul"});
 assert.equal(parseDeliveryDetails("¿Cuál es su teléfono?","name",phone),null);
 assert.equal(parseDeliveryDetails("si claro","name",phone),null);
 assert.equal(parseDeliveryDetails("18 piezas para calle Prueba 64","name",phone),null);
});

test("staff-facing fields retain facade and delivery contact without repeating address",()=>{
 const address="Avenida Prueba 64, puerta azul";
 assert.equal(deliveryAddress({address,facade:address}),address);
 assert.equal(deliveryAddress({address:"Avenida Prueba 64",facade:"Puerta azul"}),"Avenida Prueba 64. Fachada: Puerta azul");
 assert.match(orderNotes({name:"Cliente Prueba",type:"DELIVERY",deliveryPhone:phone,notes:"Sin picante"}),/Teléfono para entrega: 4270000088. Sin picante/);
 assert.doesNotMatch(orderNotes({name:"Cliente Prueba",type:"PICKUP",deliveryPhone:phone}),/Teléfono/);
});
