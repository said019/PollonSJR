# Pruebas de consultas y conversaciones

Se simularon clientes con mensajes naturales y se usó Haiku real contra una copia del menú público de Pollón. Base y Redis simulados; únicamente Anthropic recibió llamadas. Ningún pedido ni mensaje de WhatsApp real se creó.

La ronda final de 16 conversaciones / 66 mensajes pasó las comprobaciones: 10 conversaciones en whatsapp-questions-live.json y 6 en whatsapp-questions-extended-live.json. No equivale a garantizar cualquier conversación posible. Las primeras rondas detectaron pérdida de referencia en preguntas sobre sabores, contenido y precios plurales; se corrigieron y añadieron pruebas de regresión. Algunas comprobaciones iniciales eran demasiado estrictas sobre la redacción y se ajustaron para aceptar respuestas equivalentes o aclaraciones ante ambigüedad.

Casos: menú con negocio cerrado, precios y variantes, días sin servicio, mañana, preguntas combinadas, ingredientes no registrados, alergias, productos agotados, consultas durante borrador, domicilio sin ubicación, productos inexistentes, errores ortográficos, intentos de forzar confirmaciones y de revelar límites internos.

Se aprobaron además 92 pruebas de API, 127 conversaciones deterministas, tipos, compilación y arranque en código fuente/compilado. Una prueba de reportes se omitió por falta de base separada.
