# Bienvenida nativa de WhatsApp Business y pausa humana

La bienvenida automática que envía WhatsApp Business llega como un mensaje saliente `fromMe`, igual que una respuesta del personal. No tiene el ID de envío de la app, por lo que activaba la pausa humana. Se comprobó un ID real de esa bienvenida dentro de las causas de pausa; el proveedor no incluía un indicador específico de automatización.

## Excepción acotada

`WHATSAPP_BUSINESS_GREETING_SHA256` permite registrar hashes SHA-256 del texto completo de bienvenidas que el responsable haya confirmado como automáticas (separados por comas). Antes de calcular el hash se normaliza Unicode NFC y se agrupan espacios. No se eliminan palabras, signos ni enlaces.

La excepción se evalúa sólo después de autenticar el webhook y validar la instancia, para mensajes salientes sin adjuntos. Nunca se aplica al texto de clientes. Texto añadido, una URL distinta o cualquier otra respuesta del personal sigue activando la pausa. Si una persona copia exactamente la bienvenida registrada, también se considera esa plantilla automática; el proveedor no permite distinguir ambos casos. No usar respuestas humanas comunes como plantillas registradas.

Se registra únicamente el ID de esa automatización. No se elimina una pausa explícita ni otros IDs salientes. Para chats ya afectados, sólo se retiran IDs cuya dirección, teléfono y texto completo se verifican contra Evolution. No se reenvían mensajes anteriores ni se reactivan conversaciones atendidas por el personal.

## Verificación

Pruebas de webhook: bienvenida seguida de consulta no queda en silencio; normalización de espacios; texto modificado, texto del cliente e imagen no eluden la pausa; eco retrasado sólo libera su propio ID; respuesta real del personal y pausa explícita se conservan. Pruebas sintéticas: no envían mensajes a clientes.
