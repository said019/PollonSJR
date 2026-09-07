const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { mkdtemp } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
async function check(entry, source) {
  const uploads = await mkdtemp(path.join(tmpdir(), 'pollon-runtime-fixture-'));
  const env = {
    PATH: process.env.PATH, NODE_ENV: 'production', UPLOADS_DIR: uploads,
    JWT_SECRET: 'synthetic-test-only-secret-not-for-production',
    JWT_ADMIN_SECRET: 'synthetic-test-only-admin-secret-not-for-production',
    JWT_DRIVER_SECRET: 'synthetic-test-only-driver-secret-not-for-production',
    TRANSFER_PROOFS_STORAGE: 'drive',
    TRANSFER_PROOFS_URL_SIGNING_SECRET: 'synthetic-test-only-proof-secret-not-for-production',
    GOOGLE_DRIVE_OAUTH_CLIENT_ID: 'synthetic-client', GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: 'synthetic-secret',
    GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN: 'synthetic-refresh', GOOGLE_DRIVE_TRANSFER_PROOFS_FOLDER_ID: 'synthetic-folder-id',
  };
  const child = fork(path.join(root, entry), [], {
    cwd: root, env, silent: true,
    execArgv: ['--require', path.join(__dirname, 'api-runtime-fixture.cjs'), ...(source ? ['--import', 'tsx'] : [])],
  });
  let logs = ''; child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Boot timed out: ' + logs)), 20000);
      child.once('message', m => { clearTimeout(timeout); resolve(m); });
      child.once('exit', code => { clearTimeout(timeout); reject(Error('Boot exited ' + code + ': ' + logs)); });
    });
    for (const [url, expected] of [['/',200], ['/health',200], ['/api/admin/orders',401], ['/uploads/transfer-proofs/missing.pdf',404]]) {
      const response = await fetch(`http://127.0.0.1:${result.port}${url}`, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, expected, url); await response.body?.cancel();
    }
    assert.equal(result.schedules.length, 6);
    assert.equal(result.redisConnections, 5);
    assert.equal(result.workerWaits, 1);
    delete result.port;
    return result;
  } finally {
    if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); }
  }
}
async function main() {
  const source = await check('apps/api/src/server.ts', true);
  const compiled = await check('apps/api/dist/server.cjs', false);
  assert.equal(compiled.routeHash, source.routeHash);
  assert.equal(compiled.routeCount, source.routeCount);
  assert.deepEqual(compiled.schedules, source.schedules);
  console.log(JSON.stringify({ node:process.version, source, compiled, syntheticOnly:true }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
