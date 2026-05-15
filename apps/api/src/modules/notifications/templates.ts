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

  order_delivered: (p) =>
    `🎉 ¡Buen provecho ${p.name}!\n\nEsperamos que disfrutes tu Pollón. Ganaste *${p.points} puntos* de lealtad.\n\nVuelve pronto 🍗`,

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
  loyalty_reward_earned: (p) =>
    `🎉 ¡Felicidades ${p.name}! Completaste 5 pedidos en Pollón SJR.\n\nGanaste *${p.productName} gratis* 🍗\n\nSe aplica automáticamente en tu próximo pedido. Vence en 6 meses.`,

  loyalty_reward_expiring: (p) =>
    `⏰ Hola ${p.name}, tu recompensa de *${p.productName} gratis* vence en 7 días.\n\n¡Aprovéchala antes de que expire!`,
};

export function renderTemplate(template: string, params: TemplateParams): string {
  const fn = TEMPLATES[template];
  if (!fn) return `[Template desconocido: ${template}] ${JSON.stringify(params)}`;
  return fn(params);
}
