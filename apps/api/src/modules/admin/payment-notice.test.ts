import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { consultarAviso, paymentNoticeRoutes } from './payment-notice';
import { signAdminToken, signCustomerToken, signDriverToken } from '../auth/jwt.service';

test('payment notices require an existing admin, never customer or driver JWTs', async () => {
  const app = Fastify();
  app.decorate('prisma', { adminUser: { findUnique: async ({ where }: { where: { id: string } }) => where.id === 'admin-test' ? { id: where.id } : null } } as never);
  await app.register(paymentNoticeRoutes, { prefix: '/api/admin' });
  const url = '/api/admin/platform-payment-notice';
  assert.equal((await app.inject({ url })).statusCode, 401);
  for (const token of [signCustomerToken('client'), signDriverToken('driver', 'driver@example.test')]) {
    assert.equal((await app.inject({ url, headers: { authorization: `Bearer ${token}` } })).statusCode, 401);
  }
  assert.equal((await app.inject({ url, headers: { authorization: `Bearer ${signAdminToken('deleted', 'admin@example.test')}` } })).statusCode, 403);
  const response = await app.inject({ url, headers: { authorization: `Bearer ${signAdminToken('admin-test', 'admin@example.test')}` } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { aviso: null });
  assert.equal(response.headers['cache-control'], 'private, no-store');
  await app.close();
});

test('upstream notice validates date and fails open', async () => {
  const now = new Date('2026-10-13T18:00:00Z');
  const notice = { texto: 'Aviso de prueba', fecha: '2026-10-14', ciclo: '2026-10' };
  const mock = (value: unknown) => (async () => new Response(JSON.stringify({ aviso: value }))) as typeof fetch;
  assert.deepEqual(await consultarAviso('test-only', mock(notice), now), notice);
  assert.equal(await consultarAviso('test-only', mock({ ...notice, fecha: '2026-10-20' }), now), null);
  assert.equal(await consultarAviso('test-only', mock({ ...notice, texto: 'x'.repeat(301) }), now), null);
  assert.equal(await consultarAviso('test-only', (async () => { throw new Error('offline'); }) as typeof fetch, now), null);
});
