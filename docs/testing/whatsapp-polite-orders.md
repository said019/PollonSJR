# Pedido con introducción cortés y retiro posterior

2026-10-22. Regresión de la captura: «Te puedo encargar por favor un pedido: / 6 Piezas de pollo / 1 Orden de Huesitos», seguido de «Voy a recogerlo en 25 min».

Causa: el prefijo cortés no estaba permitido y «un pedido» podía confundirse con una cantidad; el flujo descartaba la interpretación y mostraba el menú completo.

Corrección: las introducciones reconocidas se separan de los productos; un prefijo no reconocido conserva el mensaje como borrador pendiente en lugar de devolver el menú. «Orden de» se compara con nombres de catálogo sin inventar productos ni precios. La intención de recoger y la hora solicitada se conservan; el plazo no se promete. Las consultas de precios siguen siendo consultas, aunque contengan cantidades.

El catálogo público consultado no contenía Huesitos. Se verificaron dos escenarios: catálogo real sin ese producto (solicitud conservada, precio/disponibilidad pendientes de revisión del equipo), y catálogo ficticio con Huesitos (pedido completo y creación única tras confirmación explícita). No se modificó el catálogo de producción.

Validación: TypeScript y build correctos; 211 pruebas compiladas aprobadas, cero fallos, una omisión preexistente. Paridad de ejecución correcta. 147 conversaciones generales / 1,317 turnos aprobados. Conversación exacta con IA real y catálogo público: 2 turnos, 4 llamadas exitosas, cero pedidos reales y cero mensajes a clientes. Las conversaciones, ubicaciones y contactos de pruebas son ficticios.
