// Synthetic boot fixture: never connect to production, run jobs or send messages.
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const originalLoad = Module._load;
const routes = [], schedules = [];
let redisConnections = 0, workerWaits = 0;
class FakeRedis extends EventEmitter {
  duplicate() { return new FakeRedis(); }
  async connect() { redisConnections++; this.emit('ready'); }
  async quit() {}
  async ping() { return 'PONG'; }
  blPop() { workerWaits++; return new Promise(() => {}); }
}
class FakePrisma {
  async $connect() {}
  async $disconnect() {}
  async $queryRaw(strings) {
    if (String(strings[0]).trim() !== 'SELECT 1') throw Error('Unexpected fixture SQL');
    return [{ value: 1 }];
  }
}
Module._load = function(request, parent, isMain) {
  if (request === '@pollon/prisma') {
    const actual = originalLoad.call(this, '@prisma/client', parent, isMain);
    return { ...actual, PrismaClient: FakePrisma };
  }
  if (request === 'redis') return { createClient: () => new FakeRedis() };
  if (request === '@socket.io/redis-adapter') {
    return { createAdapter: () => originalLoad.call(this, 'socket.io-adapter', parent, isMain).Adapter };
  }
  if (request === 'node-cron') {
    return { schedule(pattern, callback, options) { schedules.push({ pattern, options: options || null }); return { stop() {}, destroy() {} }; } };
  }
  const value = originalLoad.call(this, request, parent, isMain);
  if (request === 'fastify') {
    return new Proxy(value, { apply(target, receiver, args) {
      const app = Reflect.apply(target, receiver, args);
      app.addHook('onRoute', route => routes.push({ url: route.url, method: route.method }));
      return app;
    } });
  }
  return value;
};
// Any accidental outbound HTTP/fetch fails the fixture instead of sending data.
global.fetch = async () => { throw Error('External fetch forbidden in boot fixture'); };
require('node:https').request = () => { throw Error('External HTTPS forbidden in boot fixture'); };
const http = require('node:http');
const originalListen = http.Server.prototype.listen;
http.Server.prototype.listen = function(...args) {
  const callback = args.find(arg => typeof arg === 'function');
  return originalListen.call(this, 0, '127.0.0.1', () => {
    callback?.();
    setTimeout(() => process.send?.({
      port: this.address().port,
      routeCount: routes.length,
      routeHash: createHash('sha256').update(JSON.stringify(routes)).digest('hex'),
      schedules, redisConnections, workerWaits, rssMiB: process.memoryUsage().rss / 1048576,
    }), 100);
  });
};
