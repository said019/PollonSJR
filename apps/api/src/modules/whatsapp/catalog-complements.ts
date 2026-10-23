import type { CatalogProduct } from "./text-order";
export function catalogComplements(text:string, product:CatalogProduct, qty:number) {
 if(!/^Complemento (Chico|Grande)$/i.test(product.name)||qty<2||qty>20||product.modifiers.length!==1)return null;
 const mod=product.modifiers[0];
 if(!mod.required||mod.minSelect!==1||mod.maxSelect!==1||mod.totalQuota)return null;
 const normalized=text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[.,!?]/g,"").trim()
  .replace(/^(?:de complementos (?:serian|quiero)|quiero|de los complementos) /,"").replace(/ por favor$/,"");
 if(!/^(?:uno|una) de cada(?: uno)?$/.test(normalized)||mod.options.length!==qty)return null;
 return mod.options.map(option=>({name:mod.name,option:option.label,price:option.price,qty:1}));
}
