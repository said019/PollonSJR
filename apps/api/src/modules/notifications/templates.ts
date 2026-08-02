type TemplateParams = Record<string, string>;

const TEMPLATES: Record<string, (p: TemplateParams) => string> = {
  otp_code: (p) =>
    `Tu código de verificación de Pollón SJR es: *${p.code}*\n\nVálido por 5 minutos. No lo compartas con nadie.`,

  order_received: (p) =>
    `¡Hola ${p.name}! 🍗 *Pedido confirmado #${p.orderNumber}*\n\n` +
    `🧾 Total: *$${p.total}*\n` +
    `💳 Pago: ${p.payment}\n` +
    `📦 ${p.fulfillment}\n\n` +
    `Te avisamos en cada paso. ¡Gracias por pedir en Pollón SJR! 🔥`,

  order_preparing: (p) =>
    `🔥 Tu pollo está en la freidora, ${p.name}!\n\nPedido *#${p.orderNumber}* en preparación.\nTiempo estimado: ~${p.minutes} min.`,

  order_ready_pickup: (p) =>
    `✅ ¡Listo ${p.name}! Tu pedido *#${p.orderNumber}* está listo.\n\nPuedes pasar a recogerlo. Te esperamos 🍗`,

  order_ready_delivery: (p) =>
    `✅ ¡Listo ${p.name}! Tu pedido *#${p.orderNumber}* está listo.\n\nYa lo estamos asignando a un repartidor. ¡Pronto estará en tu puerta! 🛵`,

  order_on_the_way: (p) =>
    `🛵 ¡Tu pedido *#${p.orderNumber}* ya va en camino, ${p.name}!\n\nTiempo estimado: ~${p.minutes} min.`,

  // Este mensaje llega al 100% de los clientes justo después de comer: es el
  // mejor momento para empujar la siguiente compra. Antes decía "Ganaste 1
  // puntos de lealtad" — un número fijo y una palabra ("puntos") que no existe
  // en el sistema, que cuenta COMPRAS.
  order_delivered: (p) => {
    const cierre = "\n\nSólo cuentan los pedidos hechos en la app 🍗";
    if (p.rewardReady === "1") {
      return (
        `🎉 ¡Buen provecho ${p.name}!\n\n` +
        `🎁 *¡Tu sorpresa está lista!* Se aplica sola en tu próximo pedido.` +
        cierre
      );
    }
    if (p.progress && p.target) {
      const faltan = Number(p.remaining);
      const empuje =
        faltan === 1
          ? "¡Sólo *1 compra más* y te llevas una sorpresa! 🎁"
          : `*${faltan} compras más* y te llevas una sorpresa 🎁`;
      return (
        `🎉 ¡Buen provecho ${p.name}!\n\n` +
        `Llevas *${p.progress} de ${p.target} compras*. ${empuje}` +
        cierre
      );
    }
    return `🎉 ¡Buen provecho ${p.name}!\n\nEsperamos que disfrutes tu Pollón. ¡Vuelve pronto! 🍗`;
  },

  order_cancelled_refund: (p) =>
    `😔 Hola ${p.name}, tu pedido *#${p.orderNumber}* fue cancelado.\n\nEl reembolso de *$${p.amount}* llegará en 1-5 días hábiles. Disculpa el inconveniente.`,

  loyalty_tier_up: (p) =>
    `🎊 ¡Felicidades ${p.name}! Subiste a *${p.tier}* en Pollón SJR.\n\nTu beneficio: ${p.benefit}\n\nSe aplica automáticamente en tu próximo pedido 🍗`,

  daily_report: (p) =>
    `📊 *Reporte del día — Pollón SJR*\n\n📅 ${p.date}\n📦 Pedidos: ${p.orders}\n💰 Ventas: $${p.revenue}\n🎫 Ticket prom: $${p.avgTicket}\n\n⭐ Top producto: ${p.topProduct}\n\n¡Buen trabajo! 💪`,

  // Scheduled orders
  order_scheduled_confirmed: (p) =>
    `📅 ¡Pedido adelantado confirmado, ${p.name}!\n\nTu pedido *#${p.orderNumber}* está programado para *${p.scheduledFor}*.\n\nAnticipo pagado: $${p.deposit}\nResta por cobrar al entregar: $${p.remaining}\n\nTe avisaremos 30 min antes cuando empecemos a prepararlo 🍗`,

  order_scheduled_starting: (p) =>
    `🔥 ¡Empezamos a preparar tu pedido *#${p.orderNumber}*, ${p.name}!\n\nEstará listo en ~30 min. Ten el saldo pendiente listo al recibir.`,

  // Loyalty rewards (5-order count system)
  // Aquí SÍ se revela el premio: es el momento de la sorpresa, y además es un
  // descuento real que conviene que el cliente sepa.
  loyalty_reward_earned: (p) =>
    `🎁 ¡Felicidades ${p.name}! Completaste tus 5 compras en Pollón SJR.\n\nTu sorpresa es: *${p.productName} GRATIS* 🍗\n\nSe aplica solita en tu próximo pedido. Tienes 6 meses para usarla.`,

  loyalty_reward_expiring: (p) =>
    `⏰ Hola ${p.name}, tu recompensa de *${p.productName} gratis* vence en 7 días.\n\n¡Aprovéchala antes de que expire!`,

  // Aviso al DUEÑO de pedido nuevo (cuando la app está cerrada).
  owner_new_order: (p) =>
    `🔔 *NUEVO PEDIDO #${p.orderNumber}*\n\n` +
    `📦 ${p.type} · ${p.payment}\n` +
    `💵 Total: *$${p.total}*\n` +
    `👤 ${p.customerName} · ${p.customerPhone}\n` +
    (p.note ? `📝 ${p.note}\n` : "") +
    `\n👉 Abrir panel:\n${p.adminUrl}`,
};

export function renderTemplate(template: string, params: TemplateParams): string {
  const fn = TEMPLATES[template];
  if (!fn) return `[Template desconocido: ${template}] ${JSON.stringify(params)}`;
  return fn(params);
}
