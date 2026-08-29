/**
 * Quita el descuento de UN pedido y recalcula su total.
 *
 * Pensado para corregir a mano un pedido puntual cuyo descuento no debía
 * aplicarse. NO cambia ninguna regla del sistema: es una corrección de un
 * solo registro.
 *
 * Qué hace:
 *   1. Pone discountAmount = 0 y borra el motivo del descuento.
 *   2. Recalcula el total = subtotal + envío + propina (+ 4% si es TARJETA).
 *      Si el pedido es programado, recalcula anticipo y resto (50/50).
 *   3. Deja constancia en la bitácora del pedido (OrderStatusLog).
 *   4. Si el descuento venía de un premio de lealtad, se lo DEVUELVE al
 *      cliente para que no pierda las dos cosas (el premio y el descuento).
 *
 * Se niega a tocar un pedido con pago de TARJETA ya aprobado: ese dinero ya
 * se movió en MercadoPago y cambiar el total aquí sólo descuadraría los
 * reportes. Ésos se corrigen con un reembolso.
 *
 * Uso — SIEMPRE corre primero sin --aplicar para ver el antes/después:
 *
 *   DATABASE_URL=... npx tsx scripts/quitar-descuento-pedido.ts --pedido 2908010
 *   DATABASE_URL=... npx tsx scripts/quitar-descuento-pedido.ts --pedido 2908010 --aplicar
 *
 * Para devolverle el premio al cliente en pedidos viejos (los de antes de
 * esta corrección no guardaban qué premio consumieron), agrega el nombre
 * del producto premiado:
 *
 *   ... --pedido 2908010 --premio "12 Piezas" --aplicar
 *
 * Con Railway:
 *   railway run npx tsx packages/prisma/scripts/quitar-descuento-pedido.ts --pedido 2908010
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APP_FEE_RATE = 0.04;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function main() {
  const pedidoArg = arg("pedido");
  const orderId = arg("id");
  const apply = has("aplicar");
  const premioNombre = arg("premio");

  if (!pedidoArg && !orderId) {
    throw new Error(
      "Falta --pedido <número visible, ej. 2908010> o --id <id interno>"
    );
  }

  // El número de pedido (DDMMNNN) es único por día, no para siempre: si hay
  // varios, hay que desambiguar con el id interno.
  const matches = orderId
    ? await prisma.order.findMany({ where: { id: orderId } })
    : await prisma.order.findMany({
        where: { orderNumber: Number(pedidoArg) },
        orderBy: { createdAt: "desc" },
      });

  if (matches.length === 0) {
    throw new Error(`No existe el pedido ${orderId ?? pedidoArg}`);
  }
  if (matches.length > 1) {
    console.error(`Hay ${matches.length} pedidos con el número ${pedidoArg}:`);
    for (const o of matches) {
      console.error(`  --id ${o.id}   ${o.createdAt.toISOString()}   ${money(o.total)}`);
    }
    throw new Error("Vuelve a correrlo con --id <id interno> del que quieres corregir.");
  }

  const order = matches[0];

  const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
  if (order.paymentMethod === "CARD" && payment?.status === "APPROVED") {
    throw new Error(
      `El pedido #${order.orderNumber} ya tiene un pago con tarjeta APROBADO por ${money(payment.amount)}. ` +
        "Cambiar el total no le devuelve ni le cobra nada al cliente y descuadra los reportes: usa el reembolso desde el panel."
    );
  }

  if (order.discountAmount === 0) {
    console.log(`El pedido #${order.orderNumber} no tiene descuento. No hay nada que quitar.`);
    return;
  }

  // Recalcular igual que al crear el pedido, pero sin descuento.
  const preFeeTotal = Math.max(
    0,
    order.subtotal + order.deliveryFee + order.tipAmount
  );
  const appFeeAmount =
    order.paymentMethod === "CARD" ? Math.round(preFeeTotal * APP_FEE_RATE) : 0;
  const total = preFeeTotal + appFeeAmount;

  const depositAmount = order.isScheduled ? Math.round(total * 0.5) : order.depositAmount;
  const remainingAmount = order.isScheduled ? total - depositAmount! : order.remainingAmount;

  console.log(`\nPedido #${order.orderNumber}  (${order.id})`);
  console.log(`  estado ${order.status} · pago ${order.paymentMethod} · creado ${order.createdAt.toISOString()}`);
  console.log(`\n  ANTES                        DESPUÉS`);
  console.log(`  Subtotal   ${money(order.subtotal).padEnd(12)}     ${money(order.subtotal)}`);
  console.log(`  Descuento  ${("-" + money(order.discountAmount)).padEnd(12)}     ${money(0)}`);
  if (order.discountReason) console.log(`             (${order.discountReason})`);
  console.log(`  Envío      ${money(order.deliveryFee).padEnd(12)}     ${money(order.deliveryFee)}`);
  if (order.tipAmount) console.log(`  Propina    ${money(order.tipAmount).padEnd(12)}     ${money(order.tipAmount)}`);
  if (order.appFeeAmount || appFeeAmount)
    console.log(`  Uso app    ${money(order.appFeeAmount).padEnd(12)}     ${money(appFeeAmount)}`);
  console.log(`  TOTAL      ${money(order.total).padEnd(12)}     ${money(total)}`);
  console.log(`\n  El cliente pagaría ${money(total - order.total)} más que lo que dice su pedido.`);

  // ── Devolver el premio de lealtad, si el descuento venía de ahí ──
  const card = await prisma.loyaltyCard.findUnique({
    where: { customerId: order.customerId },
  });

  let premioProductId: string | null = order.loyaltyRewardProductId;
  if (!premioProductId && premioNombre) {
    const producto = await prisma.product.findFirst({
      where: { name: { equals: premioNombre, mode: "insensitive" } },
    });
    if (!producto) throw new Error(`No existe un producto llamado "${premioNombre}"`);
    premioProductId = producto.id;
  }

  let devolverPremio = false;
  if (premioProductId && card && !card.pendingReward) {
    devolverPremio = true;
    const p = await prisma.product.findUnique({ where: { id: premioProductId } });
    console.log(`\n  Se le devuelve al cliente su premio: ${p?.name ?? premioProductId} gratis.`);
  } else if (premioProductId && card?.pendingReward) {
    console.log(`\n  El cliente ya tiene otro premio pendiente; no se toca su tarjeta.`);
  } else if (!premioProductId) {
    console.log(
      `\n  AVISO: no se sabe qué premio consumió este pedido (los pedidos viejos no lo guardaban).\n` +
        `  Si el descuento era un premio de lealtad y quieres devolvérselo, corre de nuevo con:\n` +
        `      --premio "<nombre del producto>"`
    );
  }

  if (!apply) {
    console.log(`\n  MODO PRUEBA — no se guardó nada. Agrega --aplicar para escribirlo.\n`);
    return;
  }

  const writes: any[] = [
    prisma.order.update({
      where: { id: order.id },
      data: {
        discountAmount: 0,
        discountReason: null,
        loyaltyRewardProductId: null,
        loyaltyRewardExpiresAt: null,
        appFeeAmount,
        total,
        depositAmount,
        remainingAmount,
      },
    }),
    prisma.orderStatusLog.create({
      data: {
        orderId: order.id,
        from: order.status,
        to: order.status,
        note:
          `Corrección manual: se quitó el descuento de ${money(order.discountAmount)}` +
          (order.discountReason ? ` (${order.discountReason})` : "") +
          `. Total ${money(order.total)} → ${money(total)}.`,
      },
    }),
  ];

  if (devolverPremio && card) {
    writes.push(
      prisma.loyaltyCard.update({
        where: { id: card.id },
        data: {
          pendingReward: true,
          pendingProductId: premioProductId,
          rewardEarnedAt: new Date(),
          rewardExpiresAt:
            order.loyaltyRewardExpiresAt ??
            new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000),
          freeProductsUsed: Math.max(0, card.freeProductsUsed - 1),
        },
      }),
      prisma.loyaltyEvent.create({
        data: {
          cardId: card.id,
          orderDelta: 0,
          reason: `admin:premio devuelto — descuento quitado del pedido #${order.orderNumber}`,
        },
      })
    );
  }

  await prisma.$transaction(writes);

  console.log(`\n  ✅ Listo. Pedido #${order.orderNumber}: total ${money(total)}.`);
  console.log(
    `  Avísale al repartidor: hay que cobrar ${money(total)}, no ${money(order.total)}.\n`
  );
}

main()
  .catch((err) => {
    console.error(`\n❌ ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
