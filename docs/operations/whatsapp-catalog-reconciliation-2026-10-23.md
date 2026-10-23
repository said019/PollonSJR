# Conciliación de catálogo — pendiente de completar

Fuente leída: catálogo original de Pollón abierto en WhatsApp Business / Brave, 23 de octubre de 2026. El usuario autorizó expresamente Coca-Cola 600 ml a $35 para todos los canales. Se aplicó en la plataforma y en la fuente de datos del bot, sin sustituir el refresco de 355 ml.

## Diferencias comprobadas

| WhatsApp | Plataforma | Acción pendiente |
| --- | --- | --- |
| Alitas crujientes, medio kg con papas, $120; BBQ, Búfalo, Mango habanero, BBQ Hot, Ranch, Tamarindo | Alitas 1/2 kg, $120, inactivas; descripción sin papas; opciones distintas | Conciliar nombre, descripción, disponibilidad y opciones conservando ID e historial; obtener ID externo |
| Malteadas $75, Oreo, vainilla, fresa, chocolate, crema batida | Malteada $75, inactiva | Comprobar disponibilidad actual y vincular ficha |
| Agua 500 ml $22 | Agua de Sabor 1/2 L $22 activa; otro producto 500 ml $25 inactivo | Vincular a la presentación activa de $22, no al duplicado inactivo |
| Refresco de 600 ml aún no verificado en la ficha original | Refresco $30, descripción 355 ml | No cambiar presentación ni atribuir precio de $30 a 600 ml |

También se comprobaron precios coincidentes de combos personal ($75), pareja ($135), familiar ($280), jumbo ($518), pollo 2/4/12 piezas ($58/$110/$220), complementos chico/grande ($20/$38), soda italiana ($40), soda explosiva ($50), agua 1 L ($35), banderilla ($39) y tacos dorados ($58). El precio coincidente no basta para vincular productos: faltan identificadores externos y revisar sus opciones.

## Bloqueo técnico

No existen vínculos WhatsAppCatalogLink en la consulta realizada. El conector Evolution publicado en 5d2ab2e agrega lecturas limitadas a la cuenta del negocio, pero getOwnCatalog devuelve 503 por falta de respuesta del servicio de catálogo. Los controles de lectura de Brave funcionan; clics y teclado automatizados no cambian la ventana. Se solicitó al usuario abrir Todos los artículos y la ficha del refresco. No se debe inventar un ID ni sustituir por parecido.

## Preparado localmente

- Elecciones exactas de salsa aceptadas por nombre completo, conservando requisitos, cuotas y precios del catálogo.
- Adiciones explícitas de productos por nombre/presentación exactos mientras se termina otro producto; conservan la cola y el producto pendiente.
- Repetir el producto pendiente no lo duplica; un identificador de mensaje repetido tampoco.
- Los cambios no crean pedidos antes de la confirmación final ni evitan la pausa del personal.
- Pruebas con catálogos sintéticos: sus nombres, disponibilidad y precios NO son evidencia comercial y no deben copiarse a producción.

## Antes de publicar la API de Pollón

1. Leer fichas restantes, obtener IDs externos y resolver discrepancias de disponibilidad.
2. Aplicar conciliación con comprobación de valores anteriores, respaldo y transacción; verificar lectura posterior.
3. Probar carrito nativo real en modo de lectura y conversaciones sintéticas con catálogo conciliado, sin enviar mensajes ni crear pedidos reales.
4. Publicar versión probada; verificar commit desplegado, salud y conexión. No reactivar chats atendidos por personal.

## Cambios aplicados a la plataforma

- Coca-Cola 600 ml: ID `cmvldhviu00014e5yi19dhxt5`, $35, activa. Precio y presentación autorizados por el usuario, no inferidos de WhatsApp.
- Alitas: mismo ID `cmnzetfrm000scs3khz4ixzme`, nombre Alitas crujientes con papas fritas, $120, activas; salsa obligatoria BBQ, Búfalo, Mango habanero, BBQ Hot, Ranch o Tamarindo. Descripción y opciones comprobadas en el catálogo original.
- Respaldo anterior: `/private/tmp/pollon-catalog-before-600.json`. Se actualizaron ambos productos en una transacción y se invalidó únicamente la caché del menú.
- No se crearon vínculos externos inventados. La ficha nativa de Coca-Cola en WhatsApp sigue pendiente: la lectura del catálogo falla y los controles de escritura del navegador no ejecutan acciones.
- Recuperación limitada de carritos: cuando el carrito propio declara un artículo y no se puede leer, se pide su nombre. Una solicitud explícita que coincide con el catálogo continúa el borrador. Dos aclaraciones fallidas derivan al equipo. Carritos múltiples o de otro vendedor no se reconstruyen por suposición.
- No se reactivaron chats pausados ni se enviaron mensajes a clientes. Las pruebas con IA usaron el catálogo público y almacenamiento simulado.
