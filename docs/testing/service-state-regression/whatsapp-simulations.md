# Simulación de conversaciones de WhatsApp

Fecha: 2026-10-21T19:22:14.451Z.

127 conversaciones; 1160 mensajes de clientes. 127 aprobadas, 0 fallidas.

Se ejecutó el bot real con base de datos, Redis, geocodificador y respuestas de IA simulados. La red está bloqueada por el ejecutor. No valida la comprensión del modelo real ni conectividad de producción. No se enviaron mensajes ni se crearon órdenes reales.

| Grupo | Aprobadas | Total |
|---|---:|---:|
| Compra completa | 30 | 30 |
| Direcciones | 16 | 16 |
| Cancelación y atención humana | 22 | 22 |
| Confirmaciones ambiguas | 12 | 12 |
| Datos inválidos | 17 | 17 |
| Comprensión del cliente | 7 | 7 |
| Cambios y fallos | 9 | 9 |
| Mensajes no compatibles | 1 | 1 |
| Memoria | 6 | 6 |
| Controles de IA simulada | 7 | 7 |

## Fallos

Ninguno en los escenarios comprobados. Esto no garantiza cubrir todas las conversaciones posibles.

## Ejemplos completos

### Recoger: hola, cantidad 1, pago exacto

Cliente: hola

Bot: ¡Hola! 🍗 ¿Qué te gustaría pedir? Si quieres ver las opciones, escribe MENÚ.

Estado: menu. Órdenes simuladas: 0.

Cliente: 1

Bot: De Pollo, ¿cuántos te anoto? Puedes pedir de 1 a 20.

Estado: quantity. Órdenes simuladas: 0.

Cliente: 1

Bot: Agregado ✅
1 × Pollo: $150.00

¿Algo más? Escribe MÁS para agregar o LISTO para seguir.

Estado: more. Órdenes simuladas: 0.

Cliente: listo

Bot: ¿A qué nombre lo ponemos?

Estado: name. Órdenes simuladas: 0.

Cliente: María Prueba

Bot: ¿Pasas a recoger o te lo llevamos?
1. Recoger en el local
2. A domicilio

Estado: type. Órdenes simuladas: 0.

Cliente: 1

Bot: ¿Cómo te lo preparamos? Déjame tus indicaciones o escribe SIN NOTAS.

Estado: notes. Órdenes simuladas: 0.

Cliente: Sin picante

Bot: ¿Pagas en efectivo? Escribe EFECTIVO para seguir. Si prefieres otro medio de pago, escribe ASESOR y lo revisas con el equipo.

Estado: payment. Órdenes simuladas: 0.

Cliente: efectivo

Bot: ¿Con cuánto vas a pagar? Dime el monto en pesos, por ejemplo 500, o escribe EXACTO.

Estado: cash. Órdenes simuladas: 0.

Cliente: exacto

Bot: Así va tu pedido:
1 × Pollo — $150.00
Nombre: María Prueba
Recoger en sucursal
Notas: Sin picante
Pago en efectivo exacto
*Total: $150.00*

Pulsa Confirmar pedido. Si no aparecen botones, mantén presionado ESTE resumen, elige Responder y escribe CONFIRMAR. El resumen vence en 10 minutos.

Escribe ASESOR para atención personal o CANCELAR para descartar este borrador.

Estado: confirm. Órdenes simuladas: 0.

Cliente: [Botón: Confirmar pedido]

Bot: ¡Listo! ✅ Tu pedido #2110001 quedó registrado. Total: $150.00. Pago en efectivo.
Te avisaremos por aquí cuando cambie de estado. Escribe ASESOR para hablar con el equipo o RECORDAR PEDIDO si quieres guardarlo como habitual.

Estado: done. Órdenes simuladas: 1.

Cliente: sí

Bot: Tu pedido #2110001 ya está registrado. Escribe PEDIR para uno nuevo, RECORDAR PEDIDO para guardarlo como habitual o ASESOR.

Estado: done. Órdenes simuladas: 1.

Cliente: confirmar

Bot: Tu pedido #2110001 ya está registrado. Escribe PEDIR para uno nuevo, RECORDAR PEDIDO para guardarlo como habitual o ASESOR.

Estado: done. Órdenes simuladas: 1.

### Entrega escrita, cantidad 1

Cliente: pedir

Bot: 🍗 Menú de Pollón
También puedes elegir aquí: https://wa.me/c/5214428219534

1. Pollo — $150.00

Dime el número de lo que se te antoja.

Escribe ASESOR para atención personal o CANCELAR para descartar este borrador.

Estado: menu. Órdenes simuladas: 0.

Cliente: 1

Bot: De Pollo, ¿cuántos te anoto? Puedes pedir de 1 a 20.

Estado: quantity. Órdenes simuladas: 0.

Cliente: 1

Bot: Agregado ✅
1 × Pollo: $150.00

¿Algo más? Escribe MÁS para agregar o LISTO para seguir.

Estado: more. Órdenes simuladas: 0.

Cliente: listo

Bot: ¿A qué nombre lo ponemos?

Estado: name. Órdenes simuladas: 0.

Cliente: Cliente Prueba

Bot: ¿Pasas a recoger o te lo llevamos?
1. Recoger en el local
2. A domicilio

Estado: type. Órdenes simuladas: 0.

Cliente: 2

Bot: ¿Me pasas calle, número, colonia y ciudad? También puedes compartir tu ubicación por WhatsApp. Primero revisamos que sea el lugar correcto.

Estado: location. Órdenes simuladas: 0.

Cliente: Calle Prueba 123, Centro, San Juan del Río, México

Bot: Me aparece esta dirección:
Calle Prueba 123, Centro, San Juan del Río, México

¿Es ahí? Escribe USAR DIRECCIÓN si está bien, o CORREGIR. También puedes compartir tu ubicación. Después reviso si tenemos entrega y cuánto cuesta.

Estado: address_confirm. Órdenes simuladas: 0.

Cliente: sí

Bot: Me aparece esta dirección:
Calle Prueba 123, Centro, San Juan del Río, México

¿Es ahí? Escribe USAR DIRECCIÓN si está bien, o CORREGIR. También puedes compartir tu ubicación. Después reviso si tenemos entrega y cuánto cuesta.

Estado: address_confirm. Órdenes simuladas: 0.

Cliente: usar dirección

Bot: Dirección confirmada. Envío: $30.00.
Escribe referencias de entrega e indicaciones, SIN NOTAS o USAR PREFERENCIA.

Estado: notes. Órdenes simuladas: 0.

Cliente: Portón azul

Bot: ¿Pagas en efectivo? Escribe EFECTIVO para seguir. Si prefieres otro medio de pago, escribe ASESOR y lo revisas con el equipo.

Estado: payment. Órdenes simuladas: 0.

Cliente: efectivo

Bot: ¿Con cuánto vas a pagar? Dime el monto en pesos, por ejemplo 500, o escribe EXACTO.

Estado: cash. Órdenes simuladas: 0.

Cliente: exacto

Bot: Así va tu pedido:
1 × Pollo — $150.00
Nombre: Cliente Prueba
Entrega: Calle Prueba 123, Centro, San Juan del Río, México
Envío: $30.00
Notas: Portón azul
Pago en efectivo exacto
*Total: $180.00*

Pulsa Confirmar pedido. Si no aparecen botones, mantén presionado ESTE resumen, elige Responder y escribe CONFIRMAR. El resumen vence en 10 minutos.

Escribe ASESOR para atención personal o CANCELAR para descartar este borrador.

Estado: confirm. Órdenes simuladas: 0.

Cliente: [Botón: Confirmar pedido]

Bot: ¡Listo! ✅ Tu pedido #2110001 quedó registrado. Total: $180.00. Pago en efectivo.
Te avisaremos por aquí cuando cambie de estado. Escribe ASESOR para hablar con el equipo o RECORDAR PEDIDO si quieres guardarlo como habitual.

Estado: done. Órdenes simuladas: 1.

### cancelar durante menu

Cliente: hola

Bot: ¡Hola! 🍗 ¿Qué te gustaría pedir? Si quieres ver las opciones, escribe MENÚ.

Estado: menu. Órdenes simuladas: 0.

Cliente: cancelar

Bot: Listo, dejé de armar ese pedido. Escribe PEDIR si quieres empezar otro.

Estado: sin borrador. Órdenes simuladas: 0.

### Resumen: sí

Cliente: hola

Bot: ¡Hola! 🍗 ¿Qué te gustaría pedir? Si quieres ver las opciones, escribe MENÚ.

Estado: menu. Órdenes simuladas: 0.

Cliente: 1

Bot: De Pollo, ¿cuántos te anoto? Puedes pedir de 1 a 20.

Estado: quantity. Órdenes simuladas: 0.

Cliente: 1

Bot: Agregado ✅
1 × Pollo: $150.00

¿Algo más? Escribe MÁS para agregar o LISTO para seguir.

Estado: more. Órdenes simuladas: 0.

Cliente: listo

Bot: ¿A qué nombre lo ponemos?

Estado: name. Órdenes simuladas: 0.

Cliente: Ana Prueba

Bot: ¿Pasas a recoger o te lo llevamos?
1. Recoger en el local
2. A domicilio

Estado: type. Órdenes simuladas: 0.

Cliente: 1

Bot: ¿Cómo te lo preparamos? Déjame tus indicaciones o escribe SIN NOTAS.

Estado: notes. Órdenes simuladas: 0.

Cliente: sin notas

Bot: ¿Pagas en efectivo? Escribe EFECTIVO para seguir. Si prefieres otro medio de pago, escribe ASESOR y lo revisas con el equipo.

Estado: payment. Órdenes simuladas: 0.

Cliente: efectivo

Bot: ¿Con cuánto vas a pagar? Dime el monto en pesos, por ejemplo 500, o escribe EXACTO.

Estado: cash. Órdenes simuladas: 0.

Cliente: exacto

Bot: Así va tu pedido:
1 × Pollo — $150.00
Nombre: Ana Prueba
Recoger en sucursal
Pago en efectivo exacto
*Total: $150.00*

Pulsa Confirmar pedido. Si no aparecen botones, mantén presionado ESTE resumen, elige Responder y escribe CONFIRMAR. El resumen vence en 10 minutos.

Escribe ASESOR para atención personal o CANCELAR para descartar este borrador.

Estado: confirm. Órdenes simuladas: 0.

Cliente: sí

Bot: Sólo falta confirmarlo: pulsa Confirmar pedido en el último resumen o responde a ese mensaje con CONFIRMAR. Si quieres dejarlo, escribe CANCELAR; para pedir ayuda, ASESOR.

Estado: confirm. Órdenes simuladas: 0.

### Cantidad inválida: 0

Cliente: pedir

Bot: 🍗 Menú de Pollón
También puedes elegir aquí: https://wa.me/c/5214428219534

1. Pollo — $150.00

Dime el número de lo que se te antoja.

Escribe ASESOR para atención personal o CANCELAR para descartar este borrador.

Estado: menu. Órdenes simuladas: 0.

Cliente: 1

Bot: De Pollo, ¿cuántos te anoto? Puedes pedir de 1 a 20.

Estado: quantity. Órdenes simuladas: 0.

Cliente: 0

Bot: Escribe una cantidad del 1 al 20.

Estado: quantity. Órdenes simuladas: 0.

Cliente: 1

Bot: Agregado ✅
1 × Pollo: $150.00

¿Algo más? Escribe MÁS para agregar o LISTO para seguir.

Estado: more. Órdenes simuladas: 0.

Cliente: listo

Bot: ¿A qué nombre lo ponemos?

Estado: name. Órdenes simuladas: 0.

Cliente: Cliente Prueba

Bot: ¿Pasas a recoger o te lo llevamos?
1. Recoger en el local
2. A domicilio

Estado: type. Órdenes simuladas: 0.

Cliente: 1

Bot: ¿Cómo te lo preparamos? Déjame tus indicaciones o escribe SIN NOTAS.

Estado: notes. Órdenes simuladas: 0.

Cliente: sin notas

Bot: ¿Pagas en efectivo? Escribe EFECTIVO para seguir. Si prefieres otro medio de pago, escribe ASESOR y lo revisas con el equipo.

Estado: payment. Órdenes simuladas: 0.

Cliente: efectivo

Bot: ¿Con cuánto vas a pagar? Dime el monto en pesos, por ejemplo 500, o escribe EXACTO.

Estado: cash. Órdenes simuladas: 0.

Cliente: exacto

Bot: Así va tu pedido:
1 × Pollo — $150.00
Nombre: Cliente Prueba
Recoger en sucursal
Pago en efectivo exacto
*Total: $150.00*

Pulsa Confirmar pedido. Si no aparecen botones, mantén presionado ESTE resumen, elige Responder y escribe CONFIRMAR. El resumen vence en 10 minutos.

Escribe ASESOR para atención personal o CANCELAR para descartar este borrador.

Estado: confirm. Órdenes simuladas: 0.

Cliente: [Botón: Confirmar pedido]

Bot: ¡Listo! ✅ Tu pedido #2110001 quedó registrado. Total: $150.00. Pago en efectivo.
Te avisaremos por aquí cuando cambie de estado. Escribe ASESOR para hablar con el equipo o RECORDAR PEDIDO si quieres guardarlo como habitual.

Estado: done. Órdenes simuladas: 1.

### Solicitud humana: hablar con una persona

Cliente: hola

Bot: ¡Hola! 🍗 ¿Qué te gustaría pedir? Si quieres ver las opciones, escribe MENÚ.

Estado: menu. Órdenes simuladas: 0.

Cliente: 1

Bot: De Pollo, ¿cuántos te anoto? Puedes pedir de 1 a 20.

Estado: quantity. Órdenes simuladas: 0.

Cliente: 1

Bot: Agregado ✅
1 × Pollo: $150.00

¿Algo más? Escribe MÁS para agregar o LISTO para seguir.

Estado: more. Órdenes simuladas: 0.

Cliente: listo

Bot: ¿A qué nombre lo ponemos?

Estado: name. Órdenes simuladas: 0.

Cliente: hablar con una persona

Bot: Dejé tu solicitud para el equipo. Podrán seguir contigo por aquí.

Estado: human. Órdenes simuladas: 0.

### Cambio después del resumen: quiero cambiar la dirección

Cliente: hola

Bot: ¡Hola! 🍗 ¿Qué te gustaría pedir? Si quieres ver las opciones, escribe MENÚ.

Estado: menu. Órdenes simuladas: 0.

Cliente: 1

Bot: De Pollo, ¿cuántos te anoto? Puedes pedir de 1 a 20.

Estado: quantity. Órdenes simuladas: 0.

Cliente: 1

Bot: Agregado ✅
1 × Pollo: $150.00

¿Algo más? Escribe MÁS para agregar o LISTO para seguir.

Estado: more. Órdenes simuladas: 0.

Cliente: listo

Bot: ¿A qué nombre lo ponemos?

Estado: name. Órdenes simuladas: 0.

Cliente: Ana Prueba

Bot: ¿Pasas a recoger o te lo llevamos?
1. Recoger en el local
2. A domicilio

Estado: type. Órdenes simuladas: 0.

Cliente: 1

Bot: ¿Cómo te lo preparamos? Déjame tus indicaciones o escribe SIN NOTAS.

Estado: notes. Órdenes simuladas: 0.

Cliente: sin notas

Bot: ¿Pagas en efectivo? Escribe EFECTIVO para seguir. Si prefieres otro medio de pago, escribe ASESOR y lo revisas con el equipo.

Estado: payment. Órdenes simuladas: 0.

Cliente: efectivo

Bot: ¿Con cuánto vas a pagar? Dime el monto en pesos, por ejemplo 500, o escribe EXACTO.

Estado: cash. Órdenes simuladas: 0.

Cliente: exacto

Bot: Así va tu pedido:
1 × Pollo — $150.00
Nombre: Ana Prueba
Recoger en sucursal
Pago en efectivo exacto
*Total: $150.00*

Pulsa Confirmar pedido. Si no aparecen botones, mantén presionado ESTE resumen, elige Responder y escribe CONFIRMAR. El resumen vence en 10 minutos.

Escribe ASESOR para atención personal o CANCELAR para descartar este borrador.

Estado: confirm. Órdenes simuladas: 0.

Cliente: quiero cambiar la dirección

Bot: No he aplicado ese cambio ni confirmado un nuevo pedido. El equipo debe revisar los datos contigo. Dejé tu solicitud para el equipo. Podrán seguir contigo por aquí.

Estado: human. Órdenes simuladas: 0.

Cliente: [Botón: Confirmar pedido]

Bot:

Estado: human. Órdenes simuladas: 0.

### Imagen o audio sin texto

Cliente:

Bot: ¿Me lo escribes en un mensaje de texto? Por ahora no puedo revisar audios, fotos ni archivos. También puedes compartir tu ubicación o escribir ASESOR para que te ayude el equipo.

Estado: sin borrador. Órdenes simuladas: 0.

### Sin autorización previa: lo de siempre

Cliente: lo de siempre

Bot: Todavía no tengo un pedido habitual autorizado. Escribe PEDIR para empezar.

Estado: sin borrador. Órdenes simuladas: 0.

### Respuesta IA no válida null

Cliente: pedir

Bot: 🍗 Menú de Pollón
También puedes elegir aquí: https://wa.me/c/5214428219534

1. Pollo — $150.00

Dime el número de lo que se te antoja.

Escribe ASESOR para atención personal o CANCELAR para descartar este borrador.

Estado: menu. Órdenes simuladas: 0.

Cliente: quiero pollo

Bot: 🍗 Menú de Pollón
También puedes elegir aquí: https://wa.me/c/5214428219534

1. Pollo — $150.00

Dime el número de lo que se te antoja.

Escribe ASESOR para atención personal o CANCELAR para descartar este borrador.

Estado: menu. Órdenes simuladas: 0.

El archivo JSON adjunto contiene todas las conversaciones y resultados.
