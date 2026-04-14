# POLLÓN SJR — Sistema de Pedidos en Línea

Monorepo full-stack para **Pollón SJR** — pollería en San Juan del Río, Querétaro.  
Pedidos en línea, pagos con Mercado Pago, programa de lealtad, y panel de administración en tiempo real.

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Frontend** | Next.js 14 (App Router), Tailwind CSS, Zustand, React Query, Framer Motion |
| **Backend** | Fastify 4, Socket.io, Prisma 5, Zod |
| **Base de datos** | PostgreSQL + Redis |
| **Pagos** | Mercado Pago Checkout Pro |
| **Auth** | OTP (clientes) / JWT + bcrypt (admin) |
| **Deploy** | Vercel (web) + Railway (API + PostgreSQL + Redis) |

## Estructura del Monorepo

```
pollon-sjr/
├── apps/
│   ├── api/          # Fastify REST API + WebSockets
│   └── web/          # Next.js frontend (cliente + admin)
├── packages/
│   ├── prisma/       # Schema, migraciones, seed
│   ├── types/        # Tipos TypeScript compartidos
│   └── utils/        # Funciones utilitarias
├── .github/workflows/ci.yml
├── turbo.json
└── package.json
```

## Prerequisitos

- Node.js ≥ 20
- PostgreSQL 15+
- Redis 7+

## Instalación

```bash
# Clonar e instalar
git clone <repo-url> && cd pollon-sjr
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Generar cliente Prisma + migrar base de datos
npm run db:generate
npm run db:migrate

# (Opcional) Seed con datos iniciales
npm run db:seed
```

## Desarrollo

```bash
# Levantar todo (API + Web en paralelo)
npm run dev

# Solo API (http://localhost:3001)
npx turbo dev --filter=@pollon/api

# Solo Web (http://localhost:3000)
npx turbo dev --filter=@pollon/web
```

## Variables de Entorno

Ver [`.env.example`](.env.example) para la lista completa. Las principales:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/pollon
REDIS_URL=redis://localhost:6379

JWT_SECRET=<tu-secreto-jwt>
ADMIN_JWT_SECRET=<tu-secreto-admin>

MERCADOPAGO_ACCESS_TOKEN=<tu-access-token>
MERCADOPAGO_WEBHOOK_SECRET=<tu-webhook-secret>

NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Scripts Principales

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo (API + Web) |
| `npm run build` | Build de producción |
| `npm run db:generate` | Genera cliente Prisma |
| `npm run db:migrate` | Ejecuta migraciones |
| `npm run db:seed` | Seed de datos iniciales |

## Módulos del API

- **Auth** — OTP por WhatsApp (clientes) + email/password (admin)
- **Menu** — CRUD de productos con categorías y variantes
- **Orders** — Creación, flujo de estados, tracking real-time
- **Payments** — Integración Mercado Pago Checkout Pro + webhooks
- **Loyalty** — Sistema de puntos (1 pto/$10), tiers (Pollito → Crujiente → VIP Pollón)
- **Notifications** — Notificaciones vía WhatsApp (wa.me links)
- **Admin** — Dashboard, reportes, configuración de tienda

## Frontend

### Cliente (mobile-first)
- Menú por categorías con carrito flotante
- Checkout → Mercado Pago
- Tracker de pedido en tiempo real (Socket.io)
- Programa de lealtad con progreso visual

### Admin
- Dashboard con KPIs en tiempo real
- Kanban de pedidos activos (arrastrar estados)
- Gestión de menú (activar/desactivar/agotar productos)
- Tabla de clientes con lealtad
- Reportes de ventas por período
- Configuración de tienda, horarios y zonas de entrega

## Deploy

**API → Railway**
```bash
railway up
```

**Web → Vercel**
```bash
vercel --prod
```

El CI/CD está configurado en `.github/workflows/ci.yml` para deploy automático al hacer push a `main`.
