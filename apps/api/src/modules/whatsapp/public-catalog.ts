import { z } from "zod";
// Public WhatsApp Web catalog query. This published app token is not a user credential.
// Source: WhiskeySockets/Baileys#2717. Never send Evolution or customer credentials here.
const product = z.object({ id:z.string().min(1).max(100),name:z.string().min(1),retailer_id:z.string().nullish() });
export async function readPublicCatalog(sellerJid:string) {
 const products:z.infer<typeof product>[]=[]; let after:string|null=null;
 const cursors=new Set<string>();
 for(let page=0;page<20;page++){
  const response=await fetch("https://graph.whatsapp.com/graphql/catalog",{
   method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(10000),
   body:JSON.stringify({access_token:"WA|787118555984857|7bb1544a3599aa180ac9a3f7688ba243",doc_id:"30445081048424116",lang:"es_MX",
    variables:{request:{product_catalog:{jid:sellerJid,allow_shop_source:"ALLOWSHOPSOURCE_TRUE",width:"100",height:"100",limit:"50",after,
    catalog_session_id:null,direct_connection_encrypted_info:null,variant_info_fields:null,variant_thumbnail_height:null,variant_thumbnail_width:null}}}})
  });
  if(!response.ok)throw Error("Catálogo público no disponible");
  const raw=z.object({errors:z.array(z.unknown()).optional(),data:z.object({xwa_product_catalog_get_product_catalog:z.object({product_catalog:z.unknown()}).optional()}).optional()}).parse(await response.json());
  if(raw.errors?.length)throw Error("Consulta de catálogo rechazada");
  const catalog=z.object({products:z.array(product).max(1000),paging:z.object({after:z.string().nullish()}).optional()})
   .parse(raw.data?.xwa_product_catalog_get_product_catalog?.product_catalog);
  products.push(...catalog.products); if(products.length>1000)throw Error("Catálogo demasiado grande");
  after=catalog.paging?.after||null;
  if(!after){
   if(new Set(products.map(p=>p.id)).size!==products.length)throw Error("Catálogo duplicado");
   return products.map(p=>({id:p.id,name:p.name,...(p.retailer_id?{retailerId:p.retailer_id}:{})}));
  }
  if(cursors.has(after))throw Error("Paginación repetida"); cursors.add(after);
 }
 throw Error("Catálogo incompleto");
}
