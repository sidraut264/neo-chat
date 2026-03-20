import "fs";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";

import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fastifyMultipart from "@fastify/multipart";
import fastifyRateLimit from "@fastify/rate-limit";
import { Server as SocketIO } from "socket.io";

import { setupDB } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { channelRoutes } from "./routes/channels.js";
import { messageRoutes } from "./routes/messages.js";
import { userRoutes } from "./routes/users.js";
import { fileRoutes } from "./routes/files.js";
import { registerSocketHandlers } from "./socket/handlers.js";

// ─── Load env ─────────────────────────────────────────────────────────────────
// Simple manual .env loader — no extra dependency needed
try {
  const env = readFileSync(".env", "utf8");
  for (const line of env.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key?.trim() && !key.startsWith("#")) {
      process.env[key.trim()] ??= rest.join("=").trim();
    }
  }
} catch { /* .env is optional */ }

const PORT = parseInt(process.env.PORT || "4000");
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Fastify setup ────────────────────────────────────────────────────────────
const fastify = Fastify({
  logger: true
});

// CORS
await fastify.register(fastifyCors, {
  origin: CLIENT_ORIGIN,
  credentials: true,
});

// JWT
await fastify.register(fastifyJwt, { secret: JWT_SECRET });

// Rate limiting — 100 req/min per IP globally
await fastify.register(fastifyRateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

// Multipart (file uploads)
await fastify.register(fastifyMultipart, {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Serve uploaded files as static assets
await fastify.register(fastifyStatic, {
  root: join(__dirname, "uploads"),
  prefix: "/uploads/",
});

// ─── Routes ───────────────────────────────────────────────────────────────────
await fastify.register(authRoutes);
await fastify.register(channelRoutes);
await fastify.register(messageRoutes);
await fastify.register(userRoutes);
await fastify.register(fileRoutes);

// Health check
fastify.get("/health", async () => ({ status: "ok" }));

// ─── Socket.io ────────────────────────────────────────────────────────────────
// Socket.io needs a raw http.Server, so we pull it from Fastify
const httpServer = createServer(fastify.server ? undefined : fastify.server);

// Attach Socket.io to Fastify's underlying Node http server
const io = new SocketIO(fastify.server, {
  cors: { origin: CLIENT_ORIGIN, credentials: true },
});

// Expose io on fastify so routes can emit events (e.g. message:deleted)
fastify.decorate("io", io);

registerSocketHandlers(io, JWT_SECRET);

// ─── Start ────────────────────────────────────────────────────────────────────
try {
  await setupDB();
  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`\n🚀 Server ready at http://localhost:${PORT}\n`);
} catch (e) {
  fastify.log.error(e);
  process.exit(1);
}
