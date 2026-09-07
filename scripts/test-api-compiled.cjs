const assert = require('node:assert/strict');
const { readdir, readFile, mkdir, cp } = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { build } = require('esbuild');
const { options, root, outdir } = require('./build-api.cjs');

async function main() {
  const originalAssets = path.join(root, 'apps/api/src/modules/loyalty/pass-assets');
  const assets = await readdir(originalAssets);
  assert.ok(assets.length > 0);
  for (const name of assets) {
    assert.deepEqual(await readFile(path.join(originalAssets, name)), await readFile(path.join(outdir, 'pass-assets', name)));
  }
  const meta = JSON.parse(await readFile(path.join(outdir, 'build-meta.json'), 'utf8'));
  const imports = Object.values(meta.outputs).flatMap(output => output.imports);
  assert.ok(imports.some(i => i.path === '@pollon/prisma' && i.external));
  assert.ok(imports.every(i => !/^@pollon\/(types|utils)/.test(i.path)));
  assert.ok(imports.every(i => !/^(tsx|esbuild)(\/|$)/.test(i.path)));
  const modules = path.join(root, 'apps/api/src/modules');
  const entryPoints = [];
  for (const dir of await readdir(modules)) {
    for (const file of await readdir(path.join(modules, dir))) {
      if (file.endsWith('.test.ts')) entryPoints.push(path.join(modules, dir, file));
    }
  }
  assert.ok(entryPoints.length >= 5);
  const testsDir = path.join(outdir, 'compiled-tests');
  await mkdir(testsDir, { recursive: true });
  await build({ ...options, entryPoints, outbase: modules, outdir: testsDir, outExtension: { '.js': '.cjs' } });
  for (const file of entryPoints) {
    await cp(originalAssets, path.join(testsDir, path.dirname(path.relative(modules, file)), 'pass-assets'), { recursive: true });
  }
  const tests = entryPoints.map(file => path.join(testsDir, path.relative(modules, file).replace(/\.ts$/, '.cjs')));
  // No production configuration is inherited. Tests use their existing mocks.
  const env = { PATH: process.env.PATH, NODE_ENV: 'test', HOME: process.env.HOME };
  const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, env, stdio: 'inherit', timeout: 120000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, 'Compiled API tests must pass');
  console.log(JSON.stringify({ compiledTestFiles: tests.length, walletAssetsIdentical: assets.length, runtimeTranspilerImports: 0 }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
