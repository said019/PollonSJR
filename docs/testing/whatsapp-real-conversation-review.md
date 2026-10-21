# Revisión de conversaciones y reglas de intervención

21 de octubre de 2026. Bot desactivado; cambios preparados exclusivamente en local. No desplegar ni reactivar como parte de esta revisión.

## Alcance y privacidad

Se revisaron en WhatsApp Business, mediante Brave, cinco conversaciones: tres de empleo, una de coordinación con un repartidor y una de seguimiento de entrega atendida por el personal. También se observaron resultados de búsqueda sobre cotizaciones de repartidores externos; esos fragmentos no equivalen a revisar las conversaciones completas.

El chat de Heydi no se abrió ni se utilizó. No se enviaron mensajes. Este documento y las pruebas omiten nombres, teléfonos, direcciones, edades y transcripciones privadas. Las simulaciones usan frases sintéticas representativas; no se transmitieron chats reales a Anthropic.

La navegación volvió a fallar con `noWindowsAvailable`; la búsqueda también presentó diferencias entre el árbol de accesibilidad y la pantalla. El alcance es una muestra, no una auditoría de todos los chats.

## Hallazgos y reglas

| Contexto | Evidencia observada | Regla preparada |
| --- | --- | --- |
| Empleo | Tres personas preguntaron por vacantes y recibieron respuestas de recepción de pedidos. En una conversación, el asistente volvió al flujo de ventas después de que intervino el personal. | Empleo se deriva antes de FAQ, catálogo, notas o interpretación de IA. Un acuse breve como máximo, seguido de silencio. No decidir contratación, salarios, requisitos ni elegibilidad. |
| Repartidores | Disponibilidad para trabajar, llamadas y preguntas sobre si hay pedidos. | No convertir coordinación operativa en una compra. Las ofertas explícitas de reparto pasan a atención manual sin respuesta de ventas. Una pregunta aislada y ambigua sobre si hay pedido queda para revisión humana. |
| Entrega ya atendida | El personal acordó total y tiempo aproximado; el cliente compartió ubicación y confirmó que esperaba. | No iniciar otro carrito con agradecimientos o seguimiento. No inventar estado, tiempo de entrega, pago confirmado o cambios en un pedido existente. |
| Excepciones de envío | Fragmentos de búsqueda muestran cotizaciones con repartidores externos y casos fuera de cobertura. | Un acuerdo previo del personal no crea una tarifa, cobertura o método de pago general. La app sigue siendo la fuente de reglas; las excepciones requieren atención humana. |
| Archivos y eventos técnicos | En una conversación aparece un mensaje eliminado y dos solicitudes de escribir texto. Se desconoce el contenido original. | Ignorar reacciones y eventos de protocolo/eliminación; conservar deduplicación. No afirmar que la eliminación fue la causa de ambas respuestas. |
| Proveedores, comprobantes, reclamos y facturación | Casos preventivos derivados del límite del asistente; no todos fueron observados en chats completos. | No comprar insumos, negociar, aceptar comprobantes como pago, devolver dinero ni emitir facturas mediante texto libre. Derivar al equipo. |

## Implementado localmente

- `conversation-policy.ts`: detección de señales explícitas de empleo, operación, proveedores, asuntos de pedidos existentes y contexto manual. Es un filtro conservador, no un clasificador infalible de lenguaje natural.
- Se evalúa antes de FAQ e interpretación del carrito; también durante dirección, notas y confirmación. Derivar invalida propuestas y confirmaciones pendientes, sin crear pedidos.
- Operación, proveedores y señales de conversación manual quedan en silencio. Empleo y problemas de pedidos reciben un único acuse que no afirma que alguien ya fue notificado ni promete una respuesta inmediata.
- Una marca de atención humana separada del carrito se guarda en Redis sin vencimiento automático. Vencer el carrito, cambiar de día, insistir, pedir el menú o escribir `activar bot` como cliente no levanta la pausa. Solo el comando saliente del operador la elimina; el webhook conserva su autenticación.
- `WHATSAPP_BOT_EXCLUDED_PHONES`: lista privada, separada por comas, para excluir contactos concretos. Acepta números mexicanos normalizados e internacionales. No se cargaron contactos reales ni se cambió configuración de producción. La exclusión tiene prioridad incluso sobre el comando de reactivación de ese chat.
- Agradecimientos sin carrito activo o tras completarlo no crean un pedido ni provocan otra invitación de venta.
- Eventos de protocolo y reacciones se ignoran incluso si traen texto adicional inesperado.
- Continúan vigentes los controles previos: precios y promociones de la app, validación de confirmación, pausa distinta de cierre del día, consultas informativas con negocio cerrado y restricciones contra instrucciones del cliente que intentan cambiar reglas.

## Requisito pendiente antes de reactivar

**La toma automática por cualquier mensaje del personal aún no está implementada.** El webhook actual distingue comandos explícitos (`pausar bot` / `activar bot`) y descarta otros mensajes salientes. No se debe presentar esta revisión como solución completa a la intervención humana automática.

La implementación siguiente debe distinguir los mensajes humanos de respuestas y notificaciones enviadas por la app, incluyendo el caso en que el webhook llega antes de que finalice el envío. También debe suprimir respuestas automáticas ya en cola cuando una persona toma el chat. Pausar indiscriminadamente por cualquier `fromMe` haría que el asistente se pause por sus propias respuestas; ignorarlos todos permite interrumpir al personal.

Antes de habilitar recepción: verificar esa distinción y sus carreras con pruebas; establecer el estado manual de conversaciones que ya atiende el personal; configurar exclusiones y destinatarios de avisos si corresponde; comprobar persistencia de Redis. El bot no importa automáticamente el historial de Brave ni puede deducir por sí solo quién es familiar o proveedor. No hay números reales incorporados al código.

## Ejemplos de comportamiento esperado

| Mensaje / situación | Respuesta o acción |
| --- | --- |
| «Información sobre la vacante» | «Gracias por escribirnos. Los temas de empleo los atiende directamente el equipo por aquí.» |
| Después: «¿En dónde?», «hola», «menú» | Silencio; sigue el equipo, sin reiniciar ventas. |
| «Soy el repartidor» / «Si tienen pedidos me avisan» | Silencio y marca de atención manual. |
| «Sale lo espero» sin contexto automático fiable | Silencio y revisión manual; no prometer salida ni tiempo. |
| «Ya transferí» | Pedir revisión del equipo, sin marcar pago ni confirmar otro pedido. |
| «¿Puedo pagar con transferencia?» | Sigue siendo una consulta informativa; responder según la configuración real de la app. |
| «Quiero pollo para mi trabajo» | Sigue siendo compra de comida; la palabra trabajo por sí sola no bloquea. |
| Contacto excluido, aunque pida catálogo | Silencio. |

## Validación local

- TypeScript: aprobado.
- Compilación de producción: aprobada, sin iniciar servidor, migraciones ni trabajos.
- Suite compilada: **142 pruebas aprobadas, 0 fallos, 1 omitida** (reporte SQL que requiere base de datos). Prueba de arranque de la API compilada: aprobada con infraestructura sintética.
- Simulador: **147 conversaciones, 1,299 turnos, 147 aprobadas, 0 fallos**. Incluye 20 secuencias nuevas de atención manual, abierto y pausado, con insistencia posterior.
- Pruebas específicas: temas manuales antes de IA, preguntas legítimas sin falsos positivos en el conjunto, confirmaciones invalidadas, pausa tras expirar carrito, reactivación solo por operador, exclusiones y eventos técnicos.
- Dos expectativas antiguas del simulador se actualizaron deliberadamente: «ya pagué» ahora deriva a revisión humana tanto en efectivo como en confirmación; no se acepta como pago ni se vuelve a confirmar automáticamente.
- Pruebas deterministas con almacenamiento y colas en memoria. No se hicieron pedidos ni envíos reales; esta ronda no evalúa respuestas nuevas del modelo en vivo.

Reproducir desde la raíz del repositorio:

```sh
npm run typecheck --workspace=@pollon/api
npm run build:api:production
npm run test:api:compiled
npm run test:api:runtime
node --import tsx apps/api/src/modules/whatsapp/testing/simulate.ts /tmp/pollon-conversation-simulations
```

## Estado operativo verificado

Lectura de configuración de producción: `WHATSAPP_BOT_ENABLED=false`; webhook de Evolution activo para otros eventos, sin suscripción `MESSAGES_UPSERT`. No se hicieron cambios de configuración, despliegues ni reactivación en esta revisión.
