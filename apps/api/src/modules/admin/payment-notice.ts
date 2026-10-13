import { FastifyInstance } from 'fastify';
import { adminOnly } from '../../middlewares/admin-only';

export async function consultarAviso(token = process.env.WALLET_CLUB_NOTICE_TOKEN, fetchImpl = fetch, now = new Date()) {
  if (!token) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetchImpl('https://walletclub.com.mx/api/platform/avisos/actual', {
      headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-store' }, signal: controller.signal, redirect: 'error',
    });
    if (!response.ok) return null;
    const raw = await response.text();
    if (raw.length > 4096) return null;
    const a = JSON.parse(raw)?.aviso;
    if (!a || typeof a.texto !== 'string' || !a.texto.trim() || a.texto.length > 300 || typeof a.fecha !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(a.fecha) || a.ciclo !== a.fecha.slice(0, 7)) return null;
    const due = new Date(a.fecha + 'T00:00:00Z');
    if (!Number.isFinite(due.getTime()) || due.toISOString().slice(0, 10) !== a.fecha) return null;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    due.setUTCDate(due.getUTCDate() - 1);
    if (today !== a.fecha && today !== due.toISOString().slice(0, 10)) return null;
    return { texto: a.texto as string, fecha: a.fecha as string, ciclo: a.ciclo as string };
  } catch { return null; }
  finally { clearTimeout(timer); controller.abort(); }
}

export async function paymentNoticeRoutes(app: FastifyInstance) {
  app.get('/platform-payment-notice', { preHandler: adminOnly }, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    try {
      const id = request.admin?.adminId;
      if (!id || !await app.prisma.adminUser.findUnique({ where: { id }, select: { id: true } })) {
        return reply.status(403).send({ error: 'Acceso restringido' });
      }
      return { aviso: await consultarAviso() };
    } catch { return { aviso: null }; }
  });
}
