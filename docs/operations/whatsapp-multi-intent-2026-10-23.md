# WhatsApp: cambios completos sobre el borrador

El intérprete anterior escogía una opción de un solo paso y rechazaba mensajes con varias solicitudes. `order-planner.ts` ahora recibe el catálogo actual, las líneas completas y pendientes del pedido, y los mensajes de la aclaración actual. Propone operaciones de agregar o sustituir líneas; no tiene herramientas para confirmar pedidos, pagos, precios, horarios, descuentos o atención humana.

La app valida IDs, variantes, opciones, cantidades, cuotas y evidencia literal. Los precios se reconstruyen desde el catálogo. Las operaciones se aplican juntas a una copia del borrador. Dirección, punto, fachada, teléfono, nombre y checkoutId se conservan. Un cambio invalida la confirmación anterior. Una revisión semántica compara el resultado completo con todas las solicitudes; hay un único intento de reparación. Ante fallo se conserva el pedido y el mensaje, sin aplicar una parte ni volver a enviar todo el menú.

La distribución «uno de cada uno» conserva el producto, tamaño y cantidad de complementos. El modelo usa códigos cortos del catálogo que el servidor traduce a IDs reales. Cantidad de paquetes y piezas son distintas: ocho piezas equivalen a una unidad de la presentación de ocho.

Los comandos, datos completos reconocidos, consultas de servicio, horarios, bloqueo humano y validaciones de ubicación mantienen su flujo especializado. La intervención del personal durante una llamada de IA descarta el resultado antes de encolarlo. Los intérpretes inyectados para pruebas pueden proporcionar también un planner; no provocan llamadas reales implícitas.

## Caso reproducido

Carrito nativo: 6 piezas y 3 complementos chicos. Mensaje: «Quisiera también una hamburguesa cruji sencilla con papas. De complementos serían uno de cada uno. Y las 8 pz de pollo».

Se pregunta únicamente si ocho reemplaza seis o se agrega. Al responder que reemplaza, quedan una presentación de ocho, tres complementos chicos (puré, sopa, ensalada) y una Crujiente sencilla con papas. Con el catálogo público de esta fecha, el total para recoger es $317. Los datos faltantes se completan y la confirmación explícita usa el servicio normal de pedidos, con protección contra duplicados.

## Validación

Compilación de producción, typecheck y verificación de runtime aprobados. Suite compilada: 254 pruebas aprobadas, 0 fallos, 1 omitida preexistente.

- Pruebas automatizadas nuevas: pedido compuesto, aclaración, entrega conservada, confirmación única, edición del resumen, tamaños/cantidades inválidos, producto retirado, fallo del modelo, reparación de omisiones y fallo persistente sin aplicar parcialmente.
- Prueba de atención humana actualizada para intervenir mientras trabaja el nuevo planner.
- 147 conversaciones de regresión / 1,317 turnos: sin fallos (intérprete simulado).
- Ocho variantes con llamadas reales a Haiku y catálogo público actual: reemplazar, agregar, tres instrucciones juntas, dos purés/una sopa, Coca de 600, consulta de servicio, ambigüedad y producto inexistente. Pasaron las ocho tras corregir los fallos detectados.
- Conversación completa por el handler con Haiku, carrito de prueba y catálogo público: ocho turnos hasta resumen de $317. El carrito remoto fue simulado; no se envió ningún mensaje a clientes ni se creó un pedido en producción.
- Confirmación y creación normal de pedido verificadas sólo con infraestructura aislada de pruebas.

Estas pruebas cubren los casos indicados; no constituyen una garantía de comprensión perfecta de cualquier mensaje. No se cambió de modelo ni se reactivaron chats atendidos por personal.
