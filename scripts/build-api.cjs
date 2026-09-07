const { build } = require('esbuild');
const { cp, mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outdir = path.join(root, 'apps/api/dist');

// Only local TypeScript is bundled. Native modules, Prisma and vendor packages
// keep their normal Node resolution and runtime assets.
const options = {
  absWorkingDir: root,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  packages: 'external',
  alias: {
    '@pollon/types': path.join(root, 'packages/types/src/index.ts'),
    '@pollon/utils': path.join(root, 'packages/utils/src/index.ts'),
  },
  keepNames: true,
  sourcemap: 'external',
  metafile: true,
};

async function buildApi() {
  await mkdir(outdir, { recursive: true });
  const result = await build({
    ...options,
    entryPoints: ['apps/api/src/server.ts'],
    outfile: path.join(outdir, 'server.cjs'),
  });
  // apple-wallet.service uses __dirname/pass-assets. The bundled module now
  // lives beside server.cjs, so these exact assets must move with the artifact.
  await cp(path.join(root, 'apps/api/src/modules/loyalty/pass-assets'), path.join(outdir, 'pass-assets'), { recursive: true });
  await writeFile(path.join(outdir, 'build-meta.json'), JSON.stringify(result.metafile, null, 2));
  console.log('Production API built; Wallet assets copied. No server, migration or job was executed.');
}

module.exports = { buildApi, options, root, outdir };
if (require.main === module) buildApi().catch(error => { console.error(error); process.exitCode = 1; });
