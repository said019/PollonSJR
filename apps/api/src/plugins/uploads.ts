import { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "path";
import fs from "fs";

// Resolve uploads root once. On Railway, mount a volume at /data and set
// UPLOADS_DIR=/data/uploads. Locally we fall back to <api>/uploads.
export const uploadsDir =
  process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");

export async function registerUploads(app: FastifyInstance) {
  fs.mkdirSync(path.join(uploadsDir, "transfer-proofs"), { recursive: true });

  await app.register(multipart, {
    limits: {
      fileSize: 8 * 1024 * 1024, // 8 MB
      files: 1,
    },
  });

  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: "/uploads/",
    decorateReply: false,
    cacheControl: true,
    maxAge: "7d",
    // Los comprobantes sólo salen por la ruta HMAC de Orders. Esto protege
    // también referencias legacy cuando se usa `local` como rollback. Se
    // canonicaliza para que encoding, //, ./, ../ o backslashes no evadan el
    // bloqueo. Una ruta malformada o con encoding excesivamente anidado se
    // rechaza en vez de intentar adivinar a qué archivo apuntaba.
    allowedPath: (pathName) => {
      let decoded = pathName;
      let stabilized = false;
      for (let depth = 0; depth < 8; depth += 1) {
        try {
          const next = decodeURIComponent(decoded);
          if (next === decoded) {
            stabilized = true;
            break;
          }
          decoded = next;
        } catch {
          return false;
        }
      }
      if (!stabilized) return false;

      const normalized = path.posix.normalize(
        `/${decoded.replaceAll("\\", "/")}`
      );
      return (
        normalized !== "/transfer-proofs" &&
        !normalized.startsWith("/transfer-proofs/")
      );
    },
  });
}
