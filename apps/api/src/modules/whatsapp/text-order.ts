// Text requests are drafts only. Quantities, packages and prices are resolved
// against the app catalog; no model output may invent a product or a price.
export type CatalogProduct = { id: string; name: string; price: number; variants: Array<{label:string;price:number}> | null; modifiers: Array<{ name:string; required:boolean; minSelect:number; maxSelect:number; totalQuota:number|null; options:Array<{label:string;price:number}> }> };
export type TextOrderLine = { qty:number; phrase:string; kind:"pieces"|"side"|"product"; flavor?:"pure"|"ensalada"|"sopa"; size?:"chico"|"grande"; productId?:string };
export type TextOrderDraft = { source:string; lines:TextOrderLine[]; issue?:string; unknownPhrase?:string; unknownStart?:number; quote?:string };
export type QueuedProduct = { productId:string; qty:number; variant?:string; skipOptional?:boolean; modifiers?:Array<{name:string;option:string;price:number;qty:number}> };
const norm=(s:string)=>s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[¿?]/g,"").replace(/[-]/g," ").replace(/\s+/g," ").trim();
const words:Record<string,number>={un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,trece:13,catorce:14,quince:15,dieciseis:16,diecisiete:17,dieciocho:18,diecinueve:19,veinte:20};
const quantity=`(?:\\d+|${Object.keys(words).join("|")})`;
export const isTextOrderCandidate=(message:string)=>{
 const text=norm(message);
 if(/\b(?:cuanto|cuesta|precio|tienes|tienen|hay|horario|incluye|incluyen)\b/.test(text))return false;
 if(/[?¿]/.test(message)&&! /\b(?:encargar|encargo|quiero|quisiera|prepararme|preparar)\b/.test(text))return false;
 return new RegExp(`\\b${quantity}\\s+piezas?\\b`).test(text) || [...text.matchAll(new RegExp(`\\b${quantity}\\s+[a-z]`,"g"))].length>=2;
};
const clean=(s:string)=>norm(s).replace(/[,;:.!]+/g," ").replace(/\bpor favor\b/g,"").replace(/(?:\s+(?:y|con|mas))+$|^(?:y|con|mas)\s+/g,"").replace(/\s+/g," ").trim();
const singular=(s:string)=>norm(s).split(" ").map(w=>w.length>3&&w.endsWith("s")?w.slice(0,-1):w).join(" ");
export function parseTextOrder(source:string,catalog:CatalogProduct[]):TextOrderDraft|null {
 if(!isTextOrderCandidate(source))return null;
 // A polite introduction is not an item: in particular, "un pedido" must
 // not be read as quantity one. Offsets remain relative to the original text.
 const text=norm(source);
 const intro=/^(?:(?:hola|buenas tardes|buen dia|buenas noches)[, ]+)?(?:te puedo encargar|puedo encargar|te encargo|me harian el favor de prepararme|un pedido|me puedes preparar|quisiera hacer|quiero hacer|quiero realizar)(?: por favor)?(?: un pedido)?\s*[:,]?\s*/.exec(text);
 const offset=intro?.[0].length??0;
 const matches=[...text.slice(offset).matchAll(new RegExp(`\\b(${quantity})\\s+`,"g"))].map(m=>{m.index=m.index!+offset;return m;});
 if(!matches.length)return null;
 const prefix=clean(text.slice(offset,matches[0].index));
 if(prefix&&!/^(?:(?:hola|buenas|tardes|buenos|dias|buen|dia|noches|quiero|quisiera|ocupo|necesito|dame|mandame|me|puedes|dar|traer|por|favor)\s*)+$/.test(prefix))return {source,lines:[],issue:"Tengo tu mensaje, pero necesito aclarar cómo quieres el pedido. El equipo puede revisarlo contigo si escribes ASESOR."};
 const draft:TextOrderDraft={source,lines:[]};
 for(let i=0;i<matches.length;i++){
  const match=matches[i],qty=words[match[1]]??Number(match[1]);
  const phrase=clean(text.slice(match.index!+match[0].length,matches[i+1]?.index??text.length));
  if(!Number.isInteger(qty)||qty<1||qty>60){draft.issue="La cantidad necesita revisión del equipo.";break;}
  if(/^piezas?(?: de pollo)?$/.test(phrase)){draft.lines.push({qty,phrase,kind:"pieces"});continue;}
  const side=/^(pures?(?: de papa)?|ensaladas?(?: de (?:col|zanahoria)(?: con (?:col|zanahoria))?)?|sopas?(?: de codito)?)(?: (chicos?|grandes?))?$/.exec(phrase);
  if(side){draft.lines.push({qty,phrase,kind:"side",flavor:side[1].startsWith("pure")?"pure":side[1].startsWith("ensalada")?"ensalada":"sopa",...(side[2]?{size:side[2].startsWith("chico")?"chico" as const:"grande" as const}:{})});continue;}
  const productName=(s:string)=>singular(s).replace(/^orden(?:es)? de /,"");
  const products=catalog.filter(p=>productName(p.name)===productName(phrase));
  if(products.length===1&&qty<=20){draft.lines.push({qty,phrase,kind:"product",productId:products[0].id});continue;}
  // Keep the entire original request. Never silently discard an unknown item,
  // preparation clause, typo, or another instruction in a compound request.
  draft.issue=/^orden(?:es)? de /.test(phrase)
   ? `No encuentro «${phrase}» en el catálogo actual. Necesito que el equipo confirme su disponibilidad y precio; escribe ASESOR para revisarlo por aquí.`
   : `Necesito aclarar «${phrase}» para no cambiar lo que pediste. Dime a qué producto te refieres.`;
  draft.unknownPhrase=phrase;draft.unknownStart=text.indexOf(phrase,match.index!+match[0].length);break;
 }
 return draft;
}
const flavorMatches=(label:string,flavor:string)=>norm(label).startsWith(flavor);
export function resolveTextOrder(draft:TextOrderDraft,catalog:CatalogProduct[]) {
 const entries:QueuedProduct[]=[];const missing:string[]=[];
 if(draft.issue)return {entries,missing:[draft.issue]};
 for(const line of draft.lines){
  if(line.kind==="pieces"){
   const packs=catalog.map(p=>({p,n:Number(/^(\d+) piezas?$/i.exec(p.name)?.[1])})).filter(x=>x.n>0&&!x.p.variants?.length);
   // Exact size first; otherwise minimize the number of packages, then price.
   const ways:Array<{entries:QueuedProduct[];count:number;cost:number}|undefined>=Array(line.qty+1);ways[0]={entries:[],count:0,cost:0};
   for(let n=1;n<=line.qty;n++)for(const {p,n:size} of packs){const prev=ways[n-size];if(!prev)continue;const choice={entries:[...prev.entries,{productId:p.id,qty:1}],count:prev.count+1,cost:prev.cost+p.price};if(!ways[n]||choice.count<ways[n]!.count||choice.count===ways[n]!.count&&choice.cost<ways[n]!.cost)ways[n]=choice;}
   if(!ways[line.qty])missing.push(`No puedo completar ${line.qty} piezas con las presentaciones disponibles.`);else entries.push(...ways[line.qty]!.entries);
  }else if(line.kind==="side"){
   if(!line.size){missing.push("¿Los complementos los quieres chicos o grandes?");continue;}
   const candidates=catalog.filter(p=>norm(p.name)===`complemento ${line.size}`);
   const p=candidates.length===1?candidates[0]:undefined;
   const mods=p?.modifiers.filter(m=>m.required&&(m.totalQuota??m.maxSelect)===1&&m.options.some(o=>flavorMatches(o.label,line.flavor!)));
   const m=mods?.length===1?mods[0]:undefined;const options=m?.options.filter(o=>flavorMatches(o.label,line.flavor!));
   if(!p||!m||options?.length!==1||line.qty>20){missing.push(`Necesito revisar la presentación de ${line.phrase}.`);continue;}
   entries.push({productId:p.id,qty:line.qty,modifiers:[{name:m.name,option:options[0].label,price:options[0].price,qty:1}]});
  }else{
   if(!catalog.some(p=>p.id===line.productId)||line.qty>20)missing.push(`Ya no encuentro disponible ${line.phrase}.`);
   else entries.push({productId:line.productId!,qty:line.qty});
  }
 }
 // Merge identical lines without confusing pieces with package quantities.
 const merged:QueuedProduct[]=[];
 for(const entry of entries){const old=merged.find(e=>e.productId===entry.productId&&JSON.stringify(e.modifiers)===JSON.stringify(entry.modifiers));if(old)old.qty+=entry.qty;else merged.push({...entry});}
 if(merged.length>30||merged.some(e=>e.qty>20))missing.push("La cantidad necesita revisión del equipo.");
 return {entries:merged,missing:[...new Set(missing)]};
}
export function applySideSizes(draft:TextOrderDraft,message:string):boolean {
 const text=clean(message);
 const size=/^(?:los |las |todos |todas |ambos |ambas )?(chicos?|grandes?)$/.exec(text);
 if(size){for(const line of draft.lines)if(line.kind==="side"&&!line.size)line.size=size[1].startsWith("chico")?"chico":"grande";return true;}
 const clauses=text.split(/\s+y\s+|,/);const updates:Array<{flavor:string;size:"chico"|"grande"}>=[];
 for(const clause of clauses){const m=/^(?:los |las )?(pures?|ensaladas?|sopas?) (chicos?|grandes?)$/.exec(clause.trim());if(!m)return false;updates.push({flavor:m[1].startsWith("pure")?"pure":m[1].startsWith("ensalada")?"ensalada":"sopa",size:m[2].startsWith("chico")?"chico":"grande"});}
 if(!updates.length||updates.some(u=>!draft.lines.some(l=>l.flavor===u.flavor)))return false;
 for(const u of updates)for(const line of draft.lines)if(line.flavor===u.flavor)line.size=u.size;
 return true;
}

export function correctUnknownLine(draft:TextOrderDraft,reply:string,catalog:CatalogProduct[]):TextOrderDraft|null {
 if(!draft.unknownPhrase || draft.unknownStart===undefined || /\b(?:sin|con|extra|aparte|excepto|pago|domicilio)\b/.test(draft.unknownPhrase))return null;
 const replacement=clean(reply);
 if(!replacement || replacement.length>100 || new RegExp(`\\b${quantity}\\s+`).test(replacement))return null;
 const text=norm(draft.source),start=draft.unknownStart;
 if(text.slice(start,start+draft.unknownPhrase.length)!==draft.unknownPhrase)return null;
 const corrected=parseTextOrder(text.slice(0,start)+replacement+text.slice(start+draft.unknownPhrase.length),catalog);
 if(!corrected || corrected.issue)return null;
 return corrected;
}
