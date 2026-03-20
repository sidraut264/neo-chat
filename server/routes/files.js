import { createWriteStream, mkdirSync } from "fs";
import { pipeline } from "stream/promises";
import { extname, join } from "path";
import { randomUUID } from "crypto";
import { requireAuth } from "../middleware/auth.js";

const UPLOADS_DIR = join(process.cwd(), "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function fileRoutes(fastify) {
  // POST /upload — upload a file, get back its URL
  fastify.post(
    "/upload",
    { preHandler: requireAuth },
    async (request, reply) => {
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({ error: "No file provided" });
      }
      if (!ALLOWED_TYPES.has(data.mimetype)) {
        return reply.code(415).send({ error: "File type not allowed" });
      }

      const ext      = extname(data.filename) || "";
      const filename = `${randomUUID()}${ext}`;
      const dest     = join(UPLOADS_DIR, filename);

      let size = 0;
      const writeStream = createWriteStream(dest);

      // Track size while streaming — reject if over limit
      data.file.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_SIZE) {
          writeStream.destroy();
          data.file.destroy();
        }
      });

      try {
        await pipeline(data.file, writeStream);
      } catch {
        return reply.code(413).send({ error: "File too large (max 10 MB)" });
      }

      reply.code(201).send({
        fileUrl:  `/uploads/${filename}`,
        fileName: data.filename,
        mimeType: data.mimetype,
        size,
      });
    }
  );
}
