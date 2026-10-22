# Datos de entrega por mensajes separados

Fecha: 2026-10-22. Todas las pruebas usan datos ficticios; no se enviaron mensajes a clientes ni se crearon pedidos reales.

## Comportamiento

- Conserva el pedido compuesto (18 piezas, dos purés y dos ensaladas), sus opciones y su identificador mientras llegan dirección, fachada, teléfono, nombre y ubicación por separado.
- Reconoce campos explícitos fuera del orden de preguntas y mensajes etiquetados con varios campos. Pide sólo datos faltantes; no corrige automáticamente nombres ni calles.
- Una referencia cercana por sí sola no satisface la referencia de fachada. Se solicita una descripción del acceso o del local.
- El teléfono de entrega se conserva por separado del teléfono del cliente y aparece en el resumen y en las notas operativas del pedido. La fachada se conserva en la dirección de entrega. No se modifica la identidad ni el destino de las notificaciones del cliente.
- Una ubicación nativa posterior no borra la dirección escrita. Los puntos se validan con cobertura y tarifa de la app; una ubicación nueva fuera de zona invalida el punto y la confirmación anteriores.
- Si se usa Google Maps, el teléfono y la fachada pueden llegar durante la selección de dirección sin perderse ni aprobar el punto. USAR DIRECCIÓN llega al flujo de confirmación, no al clasificador de preguntas.
- Se respetan horarios, pausa, corte, disponibilidad de entrega, intervención del personal y confirmación final vinculada al resumen.
- Los datos ambiguos o excesivamente largos no se truncan para forzar el registro. La extracción está limitada a datos reconocibles; no se presume que todo texto libre sea una dirección o un nombre.

## Validación

- TypeScript y build de producción: correctos.
- API compilada: 207 pruebas aprobadas, 0 fallos, 1 omisión preexistente; 22 archivos de pruebas.
- Paridad de ejecución fuente/compilado: correcta.
- Simulaciones generales: 147 conversaciones, 1,317 turnos, 0 fallos.
- Regresiones específicas: orden variable, reintentos, creación única con confirmación, teléfono separado de la cuenta, referencia incompleta, teléfono inválido, consultas intercaladas, ubicación fuera de zona, fallo de geocodificación, confirmación de Maps, límites de longitud, suspensión de entrega y silencio tras intervención del personal.
- Conversación sintética con catálogo público de producción e IA real: 10 turnos, 20 llamadas a Anthropic exitosas; termina en resumen sin crear pedido. La tarifa de $60 pertenece a una zona ficticia de prueba, no es una tarifa universal.

La transcripción sintética se conserva en `whatsapp-delivery-details-live.json`.
