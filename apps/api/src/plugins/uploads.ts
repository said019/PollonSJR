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
  });
}
