# Pedidos por WhatsApp — implementación local

El cliente pide desde WhatsApp y la orden se registra mediante el mismo
`OrdersService` de la app. El panel, los estados, la validación de horarios,
precios, cobertura y notificaciones continúan en el sistema existente.
Los pedidos llevan `[WhatsApp]` en sus notas.

Este trabajo no despliega servicios, no aplica migraciones a una base remota,
no envía mensajes de prueba a clientes y no modifica el catálogo del negocio.

## Recorrido del cliente

1. Escribe PEDIR, selecciona un producto del catálogo o envía un carrito.
2. Un producto individual requiere cantidad. Un carrito conserva cantidades,
   pero pide presentaciones y opciones faltantes. Todos los precios se toman
   de la app. Los productos sin equivalencia o agotados no se sustituyen.
3. Puede agregar productos, proporcionar su nombre y elegir recoger o entrega.
4. Para entrega comparte ubicación o escribe calle, número, colonia y ciudad.
   El buscador sólo propone resultados precisos de México. Si encuentra varias
   direcciones, el cliente elige una y después confirma USAR DIRECCIÓN.
   Se calcula cobertura/envío con esas coordenadas. Si no hay certeza, el bot
   pide más datos, ubicación compartida o ASESOR, sin inventar una tarifa.
5. Confirma notas, efectivo y monto para cambio. Otros pagos requieren ASESOR
   en esta primera versión; el bot nunca marca una transferencia como pagada.
6. Revisa el resumen y pulsa **Confirmar pedido**. Si la instalación no soporta
   botones, responde **al mensaje del resumen** con CONFIRMAR (mantener
   presionado → Responder). No necesita copiar códigos. Una respuesta suelta,
   un botón de un borrador anterior o un resumen vencido no crea la orden.
7. La orden aparece en el panel y llegan las notificaciones habituales.

Los resúmenes vencen a los 10 minutos. Los cambios de menú/envío requieren
revisar el nuevo resumen. Un identificador de checkout único impide duplicar
órdenes por reenvíos o reinicios después de una creación exitosa.

ASESOR y solicitudes claras como «quiero un asesor» pausan la conversación y avisan a OWNER_PHONES. Las alergias y las solicitudes de cambio de datos del pedido también pasan al equipo e invalidan el resumen anterior. El operador puede enviar
`activar bot` o `pausar bot` desde el chat del negocio. La pausa dura hasta
24 horas desde el último mensaje. CANCELAR sólo descarta borradores; una orden
registrada se cancela mediante atención personal y el panel existente.

## Catálogo

Catálogo configurado: https://wa.me/c/5214428219534

En **Configuración → WhatsApp → Productos del catálogo de WhatsApp**, el
administrador consulta los productos de WhatsApp y vincula el ID de cada uno
con un producto de la app. Puede fijar una presentación o dejar que el bot la
pregunte. No se hacen equivalencias automáticas por parecido del nombre.
También se permite capturar manualmente el ID del producto.

Rutas protegidas por `adminOnly`, bajo `/api/evolution`:

- GET `/catalog/links`: vínculos guardados y productos de la app.
- GET `/catalog/source`: consulta de sólo lectura a Evolution getCatalog.
- PUT `/catalog/links`: guarda una equivalencia explícita.
- DELETE `/catalog/links/:externalId`: elimina la equivalencia del negocio.

Los mensajes nativos de producto contienen su ID. Los carritos nativos de
Baileys contienen `orderId`, `token` y `sellerJid`, no sus líneas completas.
Evolution publica getCatalog, pero su router público no expone getOrderDetails.
Se incluye una extensión mínima de sólo lectura:

```sh
# Sobre una copia local del código de Evolution; primero sólo previsualiza:
node integrations/evolution/add-order-details.mjs /ruta/evolution-api
# Para aplicar únicamente a esa copia local:
node integrations/evolution/add-order-details.mjs /ruta/evolution-api --apply
```

Añade `POST /business/getOrderDetails/:instance` con los mismos guards de
Evolution, limita la referencia y verifica que el vendedor corresponda al
número conectado. Devuelve exclusivamente IDs y cantidades; el bot ignora
precios del catálogo. La extensión requiere el canal Baileys. Rechaza canales
sin esa capacidad. Valida todos los puntos de inserción antes de escribir y
rechaza una segunda aplicación. Ejecutar el build y pruebas de la versión
instalada de Evolution antes de cualquier despliegue futuro.

Si la extensión o una equivalencia no están disponibles, el bot conserva el
borrador y pide selección por texto o atención personal. No crea un pedido
incompleto ni asume los IDs reales a partir de la URL pública del catálogo.

## Memoria con autorización

- `PREFERENCIA: Sin picante`: muestra exactamente lo que se guardaría.
- `GUARDAR`: autoriza la propuesta durante los siguientes 10 minutos.
- `MIS PREFERENCIAS`: consulta la nota y si hay un pedido habitual.
- `USAR PREFERENCIA`: sólo aplica la nota cuando se solicitan indicaciones;
  aparece nuevamente en el resumen. No concede excepciones comerciales.
- `RECORDAR PEDIDO`: después de una orden registrada propone recordar sus
  productos, cantidades y opciones, sin dirección ni datos de pago.
- `REPETIR PEDIDO` / `LO DE SIEMPRE`: propone ese pedido a precios actuales,
  comprobando productos y opciones. `USAR PEDIDO` lo convierte en borrador;
  vuelve a pedir nombre, entrega, pago y confirmación final.
- `BORRAR PREFERENCIAS`: borra nota y pedido habitual de ese número. No elimina
  el historial comercial de pedidos ya realizados.

La memoria está aislada por teléfono, registra el consentimiento y vence en
180 días. Los registros vencidos no se utilizan y se eliminan al consultarlos
o durante la limpieza diaria. No se infieren preferencias a partir de chats
ni se reentrena Claude. El modelo no tiene acceso de escritura a la memoria.

## IA y controles

Haiku interpreta selecciones en los pasos de producto, cantidad, presentación,
opción individual, agregar productos y tipo de entrega. Propone una sola
opción permitida con evidencia del mensaje; el cliente acepta con ELEGIR.
Las selecciones múltiples siguen usando números explícitos. No interpreta
imágenes ni audios, ni transforma una frase completa en una orden final.

El esquema y la lista de opciones se validan en el servidor. También se bloquean selecciones parciales que omiten preparación, horario, entrega o condiciones de pago del mensaje; se solicita aclaración o atención humana según corresponda. Se rechazan
campos extra, herramientas desconocidas, múltiples llamadas, respuestas
incompletas y prosa del modelo. La IA no confirma órdenes, pagos, descuentos,
cancelaciones ni reembolsos. Ante ambigüedad pregunta; las excepciones van al
equipo. Se conservan los premios de lealtad exclusivos de pedidos de la app.

A Anthropic se envían el mensaje de selección, paso actual y opciones; no se
adjuntan ficha del cliente, teléfono, dirección ni pedidos de terceros.
Las direcciones escritas se envían sólo a Google Geocoding para localizar el
punto solicitado. El bot no registra las respuestas de proveedores ni claves.

Límites: 20 consultas IA por teléfono/10 minutos, salida de 512 tokens,
timeout de 12 segundos y sin reintentos IA. La búsqueda de direcciones permite
5 consultas/10 minutos y timeout de 8 segundos. Ante errores se conserva el
borrador y se usa el flujo guiado o atención personal.

## Configuración para una futura activación

La publicación del código incluye las migraciones. La activación del canal requiere completar las variables y el webhook; el despliegue no activa automáticamente las respuestas.

1. Aplicar las migraciones `20261019000000_whatsapp_checkout` y
   `20261019010000_whatsapp_catalog_memory`, junto con las migraciones que
   correspondan a la versión a desplegar. Regenerar Prisma. Las columnas deben
   existir aunque el bot esté desactivado, porque forman parte del modelo.
2. Configurar EVOLUTION_API_URL, EVOLUTION_API_KEY y EVOLUTION_INSTANCE del
   mismo número que utiliza la app. Instalar/verificar la extensión de
   carritos en la versión de Evolution correspondiente.
3. Configurar EVOLUTION_WEBHOOK_SECRET con un secreto aleatorio de al menos
   32 caracteres. Webhook de instancia a `/api/webhook/evolution/`, evento
   MESSAGES_UPSERT, `webhookByEvents: false`, encabezado `x-webhook-secret`
   idéntico al secreto. Se exige coincidencia exacta de instancia.
4. Configurar WHATSAPP_CATALOG_PHONE=5214428219534 y guardar equivalencias en
   el panel. Las credenciales y los IDs reales no están disponibles en la
   configuración local; no se han fabricado vínculos.
5. Configurar GOOGLE_GEOCODING_API_KEY en el servidor, con Geocoding API
   habilitada. No reutilizar una clave restringida al navegador.
6. Configurar ANTHROPIC_API_KEY y WHATSAPP_AI_ENABLED=true si se usará Haiku;
   modelo por defecto ANTHROPIC_MODEL=claude-haiku-5-5. Para claves con acceso a varios workspaces, configurar también ANTHROPIC_WORKSPACE_ID; se envía como encabezado, nunca como texto al modelo.
7. Configurar ORDER_CUTOFF_TIME=18:40 en el servidor para el corte interno de pedidos inmediatos. Mantener el cierre público en la configuración de la app (19:00 según el negocio).
8. Configurar OWNER_PHONES y verificar Redis/worker de notificaciones.
   WHATSAPP_REPLY_BUTTONS=true sólo después de comprobar soporte de la
   instalación. Si no está activo, se confirma citando el resumen.
9. Activar WHATSAPP_BOT_ENABLED=true únicamente cuando se autorice el despliegue.
   Hacer una prueba controlada del recorrido; una confirmación crea una orden
   real. Verificar mapa/dirección, equivalencias, total, estado y avisos.

La API registra el ID del resumen entregado para validar respuestas citadas.
Si Evolution rechaza botones con 400/404/405/422, envía el resumen como texto.
Ante timeout/5xx no cambia de formato silenciosamente; la cola reintenta con
la misma referencia de confirmación. No hay garantía de soporte de botones
sólo porque el endpoint exista: requiere prueba real de esa versión.

## Verificación local

```sh
npm run db:generate
npm run typecheck --workspace=@pollon/api
npm test --workspace=@pollon/api
npm run typecheck --workspace=@pollon/web
```

Las pruebas simulan los proveedores y las bases de datos; no envían mensajes,
no gastan créditos ni aplican migraciones remotas. Se verifican selección de
catálogo, mapeo de carritos, direcciones precisas/ambiguas, consentimiento,
aislación y borrado de memoria, precios actuales al repetir, confirmación
citada/botón, duplicados y fallos de proveedores. El panel también se verifica
por TypeScript y renderizado local. La extensión Evolution se prueba contra
una copia temporal del código público, sin instalarla en el servicio real.

Fuentes de los contratos:
- https://github.com/evolution-foundation/evolution-api/blob/main/src/api/routes/business.router.ts
- https://github.com/WhiskeySockets/Baileys/blob/master/src/Types/Product.ts
- https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools

## Simulaciones de conversaciones

Ver [informe y comandos de simulación](testing/README.md). Las pruebas locales y la evaluación de Haiku real se reportan por separado; una respuesta de reserva por falta de acceso a Anthropic no cuenta como acierto del modelo.

La evaluación real de Haiku y los controles se describen en [el informe de pruebas](testing/README.md). El formato de llamada única usa [la configuración oficial de herramientas](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use).

## Presentación al cliente

El saludo habitual es «¡Hola! 🍗 ¿Qué te gustaría pedir?». Se usan preguntas breves como «¿A qué nombre lo ponemos?» y «¿Pasas a recoger o te lo llevamos?», sin usar «bot» para describirse. Las propuestas muestran el producto o la cantidad elegida, sin las instrucciones internas enviadas al modelo. Si el cliente pregunta quién le atiende o si es una persona, la respuesta aclara «asistente virtual» y ofrece ASESOR. La pregunta no consume datos del pedido ni confirma órdenes. Durante atención humana se mantiene el silencio de la automatización.

El inicio responde al mensaje del cliente: un saludo recibe una pregunta breve y la opción MENÚ; una solicitud de menú muestra el catálogo; un producto escrito en el primer mensaje pasa al intérprete con el texto original, sin pedir que lo repitan. Las comprobaciones de horario, disponibilidad, aceptación de la selección y confirmación final se mantienen.

## Apertura y corte interno de pedidos

El estado de apertura, la pausa de pedidos, los días de servicio y el horario se consultan en la configuración de la app. Un cierre manual o un día sin servicio impide tomar pedidos aunque todavía no llegue el corte. Se usa la zona America/Mexico_City.

ORDER_CUTOFF_TIME=18:40 está preparado en la configuración local. A partir de las 18:40:00 se rechazan pedidos inmediatos con «Por hoy ya no estamos recibiendo pedidos. ¡Gracias por escribirnos!». El valor es privado del servidor: no se agrega al catálogo, configuración pública ni contexto del modelo. El cierre público permanece independiente. Los pedidos programados de la app conservan sus reglas existentes.

La disponibilidad se comprueba al iniciar, al avanzar la conversación, al preparar el resumen y al crear el pedido. Si el cliente comenzó antes del corte pero confirma después, el pedido no se crea y su confirmación anterior se invalida. CANCELAR y ASESOR siguen disponibles.

No se consultó ni modificó la configuración de producción para este ajuste. La activación futura requiere configurar también esta variable en el servidor. Las pruebas cubren 18:39:59, 18:40:00, 18:40:59, cierre público, días sin servicio y confirmaciones pendientes.

Las respuestas de cierre distinguen el día sin servicio de una confirmación tardía. Ante «pero te escribí hace rato» se explica que quedó pendiente la confirmación; insistir no registra un pedido. La publicación del código no activa por sí sola la recepción: requiere las variables y el webhook descritos arriba.

## Redacción conversacional con IA

Todas las respuestas al cliente producidas por el flujo pasan por Haiku para redacción natural, incluidos saludos y cierres. El servidor sigue decidiendo las acciones y restricciones. Las líneas con importes, comandos y resultados de confirmación se restauran literalmente; una segunda llamada verifica equivalencia semántica. Fallos, rechazos de validación y límites de consumo conservan la respuesta autorizada. No se genera texto en conversaciones pausadas para atención humana ni para mensajes salientes del operador.

Se conservan hasta tres turnos por teléfono durante 30 minutos, separados del recuerdo voluntario de preferencias. El redactor no recibe credenciales ni el corte interno. Hay un máximo de 20 redacciones por teléfono en cada ventana de 10 minutos y tiempo máximo por llamada.

Verificación: 85 pruebas aprobadas, una de reportes omitida por falta de base de prueba; 127 conversaciones locales y 15 situaciones con Haiku real. El informe sintético está en docs/testing/whatsapp-writer-live.json. Ejecutar testing/writer-live.ts requiere --live y credenciales del entorno, nunca guardadas en el repositorio.
