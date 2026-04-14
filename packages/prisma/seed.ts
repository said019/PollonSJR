import { PrismaClient } from "@prisma/client";
import { hash } from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed de producción...");

  // ── 1. Admin
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@pollon.mx";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";
  const adminName = process.env.ADMIN_NAME ?? "Admin Pollón";

  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: await hash(adminPassword, 12),
      name: adminName,
    },
  });
  console.log(`✅ Admin: ${adminEmail}`);

  // ── 2. StoreLocation
  await prisma.storeLocation.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      lat: 20.5881,
      lng: -99.9953,
      address: "Av. Universidad 360, San Juan del Río, Qro.",
    },
  });

  // ── 3. StoreConfig
  await prisma.storeConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      isOpen: true,
      deliveryActive: true,
      acceptOrders: true,
      openDays: [4, 5, 6, 0],
      openTime: "14:00",
      closeTime: "22:00",
    },
  });

  // ── 4. DeliveryZones — 6 zonas reales ($20-$70)
  const zones = [
    { name: "0-1 km", minKm: 0, maxKm: 1, fee: 2000, color: "#2D9E5F", sortOrder: 0 },
    { name: "1-2 km", minKm: 1, maxKm: 2, fee: 3000, color: "#3B9A54", sortOrder: 1 },
    { name: "2-3 km", minKm: 2, maxKm: 3, fee: 4000, color: "#F07820", sortOrder: 2 },
    { name: "3-4 km", minKm: 3, maxKm: 4, fee: 5000, color: "#EA580C", sortOrder: 3 },
    { name: "4-5 km", minKm: 4, maxKm: 5, fee: 6000, color: "#DC2626", sortOrder: 4 },
    { name: "5-6 km", minKm: 5, maxKm: 6, fee: 7000, color: "#991B1B", sortOrder: 5 },
  ];
  await prisma.deliveryZone.deleteMany();
  await prisma.deliveryZone.createMany({ data: zones });
  console.log(`✅ Zonas de entrega: ${zones.length}`);

  // ── 5. Menú real de Pollón SJR
  const products = [
    // POLLO FRITO
    { name: "2 Piezas", description: "Pierna y muslo o pechuga y ala.", category: "POLLO_FRITO" as const, price: 5800, emoji: "🍗", sortOrder: 1 },
    { name: "4 Piezas", description: "2 piezas de pierna+muslo y 2 de pechuga+ala.", category: "POLLO_FRITO" as const, price: 11000, emoji: "🍗", sortOrder: 2 },
    { name: "6 Piezas", description: "Medio pollo. Incluye salsa.", category: "POLLO_FRITO" as const, price: 14500, emoji: "🍗", sortOrder: 3 },
    { name: "8 Piezas", description: "Para compartir. Incluye salsa.", category: "POLLO_FRITO" as const, price: 16900, emoji: "🍗", sortOrder: 4 },
    { name: "12 Piezas", description: "Pollo completo. Incluye 2 salsas.", category: "POLLO_FRITO" as const, price: 22000, emoji: "🍗", sortOrder: 5 },
    // COMBOS
    { name: "Combo Personal", description: "2 piezas + complemento chico + bebida.", category: "COMBOS" as const, price: 7500, emoji: "🥡", sortOrder: 1 },
    { name: "Combo Pareja", description: "4 piezas + 2 complementos chicos + 2 bebidas.", category: "COMBOS" as const, price: 13500, emoji: "🥡", sortOrder: 2 },
    { name: "Combo Familiar", description: "8 piezas + 3 complementos grandes + 5 bisquets.", category: "COMBOS" as const, price: 28000, emoji: "👨‍👩‍👧", sortOrder: 3 },
    { name: "Combo Extra", description: "10 piezas + 4 complementos + 6 bisquets.", category: "COMBOS" as const, price: 34000, emoji: "🥡", sortOrder: 4 },
    { name: "Combo Jumbo", description: "16 piezas + 6 complementos + 10 bisquets.", category: "COMBOS" as const, price: 51800, emoji: "🥡", sortOrder: 5 },
    // HAMBURGUESAS
    { name: "Hamburguesa Arrachera", description: "100% carne. Mayo, lechuga, jitomate, jalapeños y queso.", category: "HAMBURGUESAS" as const, price: 8900, emoji: "🍔", variants: [{ label: "Sencilla", price: 8900 }, { label: "Doble", price: 10900 }], sortOrder: 1 },
    { name: "Hamburguesa Crujiente", description: "Pechuga empanizada, lechuga, jitomate y mayo.", category: "HAMBURGUESAS" as const, price: 6800, emoji: "🍔", variants: [{ label: "Sencilla", price: 6800 }, { label: "Doble", price: 8500 }], sortOrder: 2 },
    { name: "Hamburguesa de Res", description: "Carne de res, queso, lechuga, jitomate y cebolla.", category: "HAMBURGUESAS" as const, price: 7500, emoji: "🍔", variants: [{ label: "Sencilla", price: 7500 }, { label: "Doble", price: 9000 }], sortOrder: 3 },
    { name: "Hot-Dog", description: "Salchicha, mostaza, cátsup, mayonesa y cebolla.", category: "HAMBURGUESAS" as const, price: 2800, emoji: "🌭", sortOrder: 4 },
    // SNACKS
    { name: "Banderillas", description: "Salchicha cubierta de masa frita.", category: "SNACKS" as const, price: 3900, emoji: "🌽", sortOrder: 1 },
    { name: "Papas a la Francesa", description: "Crujientes, con sal.", category: "SNACKS" as const, price: 5000, emoji: "🍟", sortOrder: 2 },
    { name: "Nuggets x6", description: "6 nuggets de pollo con salsa.", category: "SNACKS" as const, price: 6000, emoji: "🍗", sortOrder: 3 },
    { name: "Papas al Gajo", description: "Papas al gajo con condimento especial.", category: "SNACKS" as const, price: 6000, emoji: "🥔", sortOrder: 4 },
    { name: "Aros de Cebolla", description: "Aros de cebolla empanizados.", category: "SNACKS" as const, price: 7500, emoji: "🧅", sortOrder: 5 },
    { name: "Dedos de Queso", description: "Bastones de queso empanizados.", category: "SNACKS" as const, price: 8500, emoji: "🧀", sortOrder: 6 },
    { name: "Boneless", description: "Trozos de pollo sin hueso, empanizados.", category: "SNACKS" as const, price: 8500, emoji: "🍗", sortOrder: 7 },
    { name: "Alitas 1/2 kg", description: "Media kilo de alitas fritas con salsa a elegir.", category: "SNACKS" as const, price: 12000, emoji: "🍗", sortOrder: 8 },
    // FLAUTAS
    { name: "Flautas x4", description: "4 flautas de pollo o papa con crema, salsa y queso.", category: "FLAUTAS" as const, price: 5800, emoji: "🌮", sortOrder: 1 },
    // COMPLEMENTOS
    { name: "Complemento Chico", description: "Colitas de papa, ensalada o arroz.", category: "COMPLEMENTOS" as const, price: 2000, emoji: "🥗", sortOrder: 1 },
    { name: "Complemento Grande", description: "Ración grande.", category: "COMPLEMENTOS" as const, price: 3800, emoji: "🥗", sortOrder: 2 },
    { name: "Bisquet", description: "Bisquet recién horneado.", category: "COMPLEMENTOS" as const, price: 600, emoji: "🥐", sortOrder: 3 },
    { name: "Puré de Papa", description: "Puré de papa cremoso.", category: "COMPLEMENTOS" as const, price: 2000, emoji: "🥔", sortOrder: 4 },
    { name: "Sopa", description: "Sopa del día.", category: "COMPLEMENTOS" as const, price: 2000, emoji: "🥣", sortOrder: 5 },
    { name: "Ensalada", description: "Ensalada fresca.", category: "COMPLEMENTOS" as const, price: 2500, emoji: "🥗", sortOrder: 6 },
    { name: "Salsa Extra", description: "Salsa de la casa.", category: "COMPLEMENTOS" as const, price: 2500, emoji: "🫙", sortOrder: 7 },
    // BEBIDAS
    { name: "Refresco", description: "Coca-Cola, Pepsi, Jarritos u otra. 355ml.", category: "BEBIDAS" as const, price: 2800, emoji: "🥤", sortOrder: 1 },
    { name: "Arizona", description: "Té Arizona sabores variados.", category: "BEBIDAS" as const, price: 3000, emoji: "🍹", sortOrder: 2 },
    { name: "Soda Italiana", description: "Agua mineral con sirope de sabores.", category: "BEBIDAS" as const, price: 4000, emoji: "🫧", sortOrder: 3 },
    { name: "Soda Explosiva", description: "Soda italiana con perlas moleculares.", category: "BEBIDAS" as const, price: 5000, emoji: "💥", sortOrder: 4 },
    { name: "Malteada", description: "Malteada artesanal sabores variados.", category: "BEBIDAS" as const, price: 6900, emoji: "🥛", sortOrder: 5 },
    { name: "Agua 1/2 L", description: "Agua purificada.", category: "BEBIDAS" as const, price: 2000, emoji: "💧", sortOrder: 6 },
    { name: "Agua 1 L", description: "Agua purificada.", category: "BEBIDAS" as const, price: 3500, emoji: "💧", sortOrder: 7 },
    { name: "Agua de Sabor 500ml", description: "Agua fresca del día.", category: "BEBIDAS" as const, price: 2500, emoji: "🧃", sortOrder: 8 },
    { name: "Café o Té", description: "Café o té caliente.", category: "BEBIDAS" as const, price: 2500, emoji: "☕", sortOrder: 9 },
  ];

  // Clean dependent records before resetting products
  await prisma.orderItemModifier.deleteMany();
  await prisma.promotionItem.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.productModifier.deleteMany();
  // Only delete products that have no orderItems
  const orderedProductIds = (await prisma.orderItem.findMany({ select: { productId: true }, distinct: ["productId"] })).map((x) => x.productId);
  await prisma.product.deleteMany({ where: { id: { notIn: orderedProductIds.length > 0 ? orderedProductIds : ["__none__"] } } });

  const createdProducts: Array<{ id: string; name: string; category: string }> = [];
  for (const p of products) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    if (existing) {
      const updated = await prisma.product.update({ where: { id: existing.id }, data: p });
      createdProducts.push(updated);
    } else {
      const created = await prisma.product.create({ data: p });
      createdProducts.push(created);
    }
  }
  console.log(`✅ Productos: ${createdProducts.length}`);

  // ── 6. Modificadores
  // Salsas (+$25) para POLLO_FRITO y COMBOS
  const salsaOptions = [
    { label: "BBQ", price: 2500 },
    { label: "Chipotle", price: 2500 },
    { label: "Buffalo", price: 2500 },
    { label: "Habanero", price: 2500 },
    { label: "Mango habanero", price: 2500 },
  ];

  const polloFritoCombos = createdProducts.filter(
    (p) => p.category === "POLLO_FRITO" || p.category === "COMBOS"
  );
  for (const prod of polloFritoCombos) {
    await prisma.productModifier.create({
      data: {
        productId: prod.id,
        name: "Salsa extra",
        options: salsaOptions,
        required: false,
        maxSelect: 3,
        minSelect: 0,
        sortOrder: 0,
      },
    });
  }

  // Papas (+$20, 120g) para HAMBURGUESAS
  const hamburguesas = createdProducts.filter((p) => p.category === "HAMBURGUESAS");
  for (const prod of hamburguesas) {
    await prisma.productModifier.create({
      data: {
        productId: prod.id,
        name: "Agregar papas",
        options: [{ label: "Papas 120g", price: 2000 }],
        required: false,
        maxSelect: 1,
        minSelect: 0,
        sortOrder: 0,
      },
    });
  }
  console.log(`✅ Modificadores creados`);

  // ── 7. Promociones semanales
  const findP = (name: string) => createdProducts.find((p) => p.name === name);

  // Miércoles — Combo Snacks · $120
  const wednesdayItems = [
    { name: "Dedos de Queso", qty: 3 },
    { name: "Boneless", qty: 4 },
    { name: "Aros de Cebolla", qty: 3 },
    { name: "Papas a la Francesa", qty: 1 },
  ];
  const wedPromo = await prisma.promotion.create({
    data: {
      name: "Combo Snacks",
      description: "Miércoles — 3 dedos de queso, 4 boneless, 3 aros, papas.",
      dayOfWeek: 3,
      price: 12000,
      active: true,
    },
  });
  for (const item of wednesdayItems) {
    const p = findP(item.name);
    if (p) await prisma.promotionItem.create({ data: { promotionId: wedPromo.id, productId: p.id, qty: item.qty } });
  }

  // Jueves — 2 Hamburguesas Crujientes · $199
  const thuPromo = await prisma.promotion.create({
    data: {
      name: "2 Hamburguesas Crujientes",
      description: "Jueves — 2 Crujientes sencillas + 2 papas + 2 aguas de sabor.",
      dayOfWeek: 4,
      price: 19900,
      active: true,
    },
  });
  const crujiente = findP("Hamburguesa Crujiente");
  const papas = findP("Papas a la Francesa");
  const aguaSabor = findP("Agua de Sabor 500ml");
  if (crujiente) await prisma.promotionItem.create({ data: { promotionId: thuPromo.id, productId: crujiente.id, qty: 2, variant: "Sencilla" } });
  if (papas) await prisma.promotionItem.create({ data: { promotionId: thuPromo.id, productId: papas.id, qty: 2 } });
  if (aguaSabor) await prisma.promotionItem.create({ data: { promotionId: thuPromo.id, productId: aguaSabor.id, qty: 2 } });

  // Viernes — Drinks · $120
  const friPromo = await prisma.promotion.create({
    data: {
      name: "Viernes de Drinks",
      description: "Viernes — 3 sodas explosivas con perlas moleculares.",
      dayOfWeek: 5,
      price: 12000,
      active: true,
    },
  });
  const sodaExp = findP("Soda Explosiva");
  if (sodaExp) await prisma.promotionItem.create({ data: { promotionId: friPromo.id, productId: sodaExp.id, qty: 3 } });

  console.log(`✅ Promociones: 3 (Mié, Jue, Vie)`);

  console.log(`\n🎉 Seed completado`);
  console.log(`   Admin: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
