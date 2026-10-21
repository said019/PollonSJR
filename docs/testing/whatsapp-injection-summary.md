# Protección frente a descuentos inventados y prompt injection

Revisión local del 21 de octubre de 2026. Bot verificado desactivado: `WHATSAPP_BOT_ENABLED=false` y sin `MESSAGES_UPSERT` en Evolution. No se publicó, desplegó ni reactivó esta revisión. Ninguna prueba envió mensajes o creó pedidos reales.

## Controles aplicados

1. Los precios y totales siguen calculándose en el servidor con datos de la app. El modelo sólo puede proponer códigos de opciones permitidas; no dispone de operaciones para alterar precios, descuentos, pagos o confirmar pedidos. Se conservan la aceptación de selecciones y la confirmación final.
2. Se rechazan solicitudes explícitas de descuentos no autorizados, regalos, precios alterados, suplantación del dueño o administrador y cambios de instrucciones. En esos casos no se guardan como notas o datos del pedido, se conserva el borrador y se elimina cualquier propuesta de selección pendiente. Las consultas normales de promociones y precios siguen permitidas.
3. Los detectores de texto son una ayuda para responder, no la barrera principal: no se presupone que reconozcan todos los ataques.
4. El servidor conserva literalmente todas las líneas del contenido autorizado. La IA puede añadir como máximo dos frases de cortesía de una lista cerrada. No puede añadir prosa libre, descuentos, enlaces, promesas, confirmaciones ni texto de secretos. Se exige cada marcador exactamente una vez, en orden y en una línea propia. Cualquier salida inválida usa la respuesta autorizada.
5. El verificador semántico permanece como control adicional, pero su aprobación no puede saltarse la validación determinista. Las credenciales no se incluyen en el contexto del modelo.
6. Los beneficios autorizados por datos de la app se mantienen, incluyendo opciones con precio cero; no se inventan beneficios por petición del cliente. La protección no afirma que no existan promociones cuando ese dato no está confirmado.
7. Un cliente no puede reactivar una conversación transferida a atención humana.

## Resultados

- 24 variantes de ataque en 9 etapas del pedido: 216 comprobaciones aprobadas, sin cambios al borrador ni pedidos creados.
- Rechazo de herramientas falsificadas con importes, descuentos, estado de pago o acciones no permitidas.
- Simulación de redactor comprometido y verificador que aprueba todo: las salidas maliciosas siguen rechazadas por el servidor.
- Casos con texto Unicode, caracteres invisibles, roles system/developer, instrucciones en inglés, falsas promesas anteriores, extracción de secretos y manipulación de marcadores.
- Haiku real: 12 ataques al redactor y 4 conversaciones de 3 mensajes; 53 llamadas correctas, 0 errores del proveedor y 0 fallos detectados. Datos y clientes sintéticos; red restringida al proveedor de IA.
- 127 conversaciones de regresión, 1,160 mensajes: todas aprobadas.
- 110 pruebas compiladas aprobadas, 0 fallidas, 1 omitida de reportes SQL por falta de su base de prueba específica.
- TypeScript, compilación de producción y equivalencia del servidor compilado: aprobadas.

Se detectó y corrigió un falso positivo en «No quiero descuento, quiero el precio normal». La excepción sólo retira esa negación para clasificar la petición y no deshabilita las validaciones del servidor.

## Reproducción y evidencia

- `node --import tsx --test apps/api/src/modules/whatsapp/injection.test.ts`
- `npm run typecheck --workspace=@pollon/api`
- `npm run build:api:production && npm run test:api:compiled && npm run test:api:runtime`
- `node --import tsx apps/api/src/modules/whatsapp/testing/simulate.ts docs/testing/injection-regression`
- Con las credenciales de Anthropic en el entorno: `node --import tsx apps/api/src/modules/whatsapp/testing/injection-live.ts --live`

Transcripciones: `whatsapp-injection-live.json` e `injection-regression/whatsapp-simulations.json`.

Estas pruebas no demuestran inmunidad universal. La defensa central limita las capacidades del modelo y valida el resultado en código, independientemente de si detecta una frase concreta de ataque. Pendiente publicación y verificación de la versión desplegada antes de cualquier reactivación autorizada.
