# Verificación de pausas y atención por WhatsApp — 21 de octubre de 2026

## Estado operativo

El bot permanece desactivado por solicitud del usuario. Se verificó `WHATSAPP_BOT_ENABLED=false` y la ausencia de `MESSAGES_UPSERT` en el webhook de Evolution; la instancia sigue `open`. Esta revisión se preparó localmente, sin publicar, desplegar ni reactivar el bot. No se enviaron mensajes ni se crearon pedidos de clientes reales.

## Correcciones

- Una pausa de recepción se distingue del cierre del día, del horario de apertura y del límite interno para pedidos.
- Las consultas de hoy usan una sola lectura de configuración. Al reabrir, las respuestas consultan el estado actual y no conservan el cierre del historial.
- Preguntas frecuentes de servicio sin puntuación o con variantes como «hoy ay servicio» se contestan con datos de la app incluso si no responde la IA.
- Las consultas de menú siguen disponibles durante pausas y cierres; una respuesta sobre domicilio aclara si la recepción está en pausa.
- «¿Hoy ya no abren?», «¿cuándo vuelven?» y la insistencia reciben explicaciones distintas y pertinentes. No se promete una hora de regreso ni se revela el corte interno.
- Un pedido pendiente durante una pausa queda expresamente sin registrar. Su confirmación anterior se invalida; tras reabrir necesita un resumen y confirmación nuevos.
- Se corrigió una excepción real al encolar la respuesta después de eliminar una confirmación (`Cannot read properties of undefined (reading 'code')`).
- Una pregunta por promociones no queda reducida a elegir un producto ni se convierte en un descuento inventado. Las preguntas combinadas conservan el precio solicitado.
- Las líneas que describen el estado del negocio se conservan durante la redacción con IA. La validación rechaza nuevas afirmaciones de cierre del día o promesas de reapertura durante una pausa.

## Evidencia final

- 127 conversaciones deterministas, 1,160 mensajes: 127 aprobadas, 0 fallos.
- 10 conversaciones de estados con Haiku real, 39 mensajes: 0 fallos, 87 respuestas estructuradas del proveedor, 0 errores HTTP.
- 6 conversaciones adicionales de menú, ingredientes, promociones y preguntas combinadas con Haiku real, 24 mensajes: 0 fallos, 64 llamadas.
- Total de las rondas finales: 143 conversaciones y 1,223 mensajes. Todas son simulaciones con infraestructura en memoria; las rondas indicadas sí llaman al proveedor real de IA.
- Matriz determinista de 308 combinaciones de siete días, estados abierto/cerrado/pausado y once límites de horario.
- Pausa y reapertura en nueve etapas del pedido; conservación del borrador, invalidación del botón antiguo, deduplicación y cero pedidos no confirmados.
- 104 pruebas compiladas aprobadas, 0 fallidas. Una prueba SQL de reportes quedó omitida porque requiere una base específica de pruebas, sin relación con WhatsApp.
- TypeScript, compilación de producción y comprobación de equivalencia del servidor compilado: aprobadas.

## Fallos detectados durante el trabajo

La primera ronda de estados reprodujo la excepción al retirar una confirmación; se corrigió y se añadió una prueba del manejador completo. Una ronda de menú detectó una clasificación inadecuada de «¿tienen dos por uno o descuentos?»; se conserva ese resultado en `whatsapp-service-state-promotions-first.json`. Tras corregirlo se repitió la ronda y quedó sin fallos. La revisión manual de las conversaciones también detectó repetición excesiva en las respuestas de pausa; se ajustaron y se repitieron las diez conversaciones de estados.

## Reproducción

- `npm run typecheck --workspace=@pollon/api`
- `npm run build:api:production`
- `npm run test:api:compiled`
- `npm run test:api:runtime`
- `node --import tsx apps/api/src/modules/whatsapp/testing/simulate.ts docs/testing/service-state-regression`
- Con las credenciales de Anthropic en el entorno, sin credenciales de clientes de producción: `node --import tsx apps/api/src/modules/whatsapp/testing/service-state-live.ts --live`
- `node --import tsx apps/api/src/modules/whatsapp/testing/questions-live.ts --live --extended`

Los resultados completos están en `whatsapp-service-state-live.json`, `whatsapp-questions-extended-live.json` y `service-state-regression/whatsapp-simulations.json`. La aprobación de estas pruebas cubre los escenarios descritos; no equivale a una prueba de entrega por WhatsApp en producción. El bot permanece apagado.
