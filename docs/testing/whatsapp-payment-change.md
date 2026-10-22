# Cambio de pago después de un pedido

## Incidente

Una solicitud que describía una selección previa de efectivo y preguntaba si era posible transferir no coincidía con el detector de cambios de pedido. La consulta entraba a preguntas informativas y podía recibir la respuesta genérica de datos desconocidos. El posterior mensaje `Asesor` sí pausaba la conversación, como está diseñado.

## Corrección

- Detectar selecciones anteriores, preferencias de sustitución, cambios de método y pedidos ya realizados que mencionen el pago, antes del clasificador de preguntas o del intérprete de ventas.
- Pasar directamente a atención humana con una respuesta específica: el equipo debe confirmar el cambio antes de pagar. No pedir que el cliente escriba `Asesor` de nuevo.
- Mantener invalidación de confirmaciones, pausa persistente y una sola respuesta. No cambiar el método de pago, aprobar transferencias, proporcionar cuentas ni crear pedidos.
- Conservar preguntas generales de medios de pago y cambio en efectivo fuera de esta clasificación.

## Verificación local

- El caso reportado falla antes de corregir el detector y pasa después.
- 14 variantes añadidas, cada una con negocio abierto y cerrado.
- Secuencia completa en cinco estados de carrito, abierto/cerrado, con IA simulada no disponible: una respuesta, un aviso al destinatario configurado, ninguna entrada al clasificador de preguntas, ninguna orden y silencio posterior incluso si el cliente insiste o contesta el personal.
- Suite compilada: 179 pruebas pasan, 0 fallan, 1 omitida por requerir base de datos.
- Typecheck, build de producción y equivalencia de arranque compilado pasan.

## Atención humana

El marcador de atención humana no garantiza que una persona responda. Los avisos internos sólo se envían si `OWNER_PHONES` tiene destinatarios configurados. Se comprobó que esa configuración falta en producción; se solicitó al responsable un destinatario, sin inventar ni publicar números privados.
