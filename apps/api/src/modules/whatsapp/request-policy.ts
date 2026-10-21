/** Convenience routing only. Security also relies on server-owned prices,
 * action allowlists, explicit confirmation and a constrained response renderer. */
export function requestPolicyReply(message: string): string | null {
 const text=message.normalize("NFKC").replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
 const injection=/(?:ignora|olvida|omite|ignore|disregard|override).{0,90}(?:reglas|instrucciones|rules|instructions|sistema)|(?:system|developer|assistant)\s*:|<\/?(?:system|developer|assistant)>|(?:soy|i am).{0,25}(?:dueno|administrador|owner|admin)|(?:muestra|revela|dime|print|reveal).{0,60}(?:prompt|api.?key|token|secreto|secret|credenciales)|(?:actua|actúa|act as).{0,30}(?:administrador|system|developer)|(?:ejecuta|execute|run).{0,30}(?:sql|curl|fetch|javascript)|(?:unitPrice|discountAmount|paymentStatus)\s*["']?\s*[:=]/i.test(text);
 const concessionText=text.replace(/\bno quiero (?:un )?descuento\b/g, "");
 const concession=/(?:dame|hazme|aplica|aplicame|quiero|ponme|regala\w*|descuenta\w*|cobrame|dejalo|dejame|me das|me haces|give me|apply|make it).{0,100}(?:descuento|promo|gratis|regalo|cupon|mitad|cero|free|discount|2\s*x\s*1)|(?:envio|pedido|pollo|todo).{0,30}(?:gratis|a mitad|a cero)|(?:baja|cambia|reduce|ajusta).{0,30}(?:precio|total)|(?:ya|me).{0,30}(?:prometiste|autorizaste|prometieron).{0,40}(?:descuento|gratis|regalo)/.test(concessionText);
 if(concession)return "No he aplicado ningún descuento ni regalo. Solo puedo usar los precios y beneficios que valide la app al revisar tu pedido. Puedes continuar con el menú o escribir ASESOR para consultar al equipo.";
 if(injection)return "Por aquí puedo ayudarte con el menú y tu pedido. Los precios, las promociones y las condiciones se validan en la app; no se cambian por instrucciones enviadas al chat. Escribe ASESOR si necesitas ayuda del equipo.";
 return null;
}
