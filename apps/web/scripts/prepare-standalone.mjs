import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const appRoot = process.cwd();
const standaloneAppRoot = path.join(appRoot, ".next", "standalone", "apps", "web");

if (!existsSync(standaloneAppRoot)) {
  throw new Error(`No se encontró el standalone output de Next.js: ${standaloneAppRoot}`);
}

const publicDir = path.join(appRoot, "public");
if (existsSync(publicDir)) {
  cpSync(publicDir, path.join(standaloneAppRoot, "public"), { recursive: true });
}

const staticDir = path.join(appRoot, ".next", "static");
const standaloneStaticDir = path.join(standaloneAppRoot, ".next", "static");
if (existsSync(staticDir)) {
  mkdirSync(path.dirname(standaloneStaticDir), { recursive: true });
  cpSync(staticDir, standaloneStaticDir, { recursive: true });
}
