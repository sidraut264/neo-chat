import { db } from "../db.js";

// In-memory presence store: { socketId -> { userId, name } }
const online = {};

export function registerSocketHandlers(io, jwtSecret) {
  // Authenticate every socket connection with the same JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token"));

    try {
      // Fastify JWT signs/verifies with the raw secret
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString()
      );
      // Basic expiry check
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return next(new Error("Token expired"));
      }
      socket.user = payload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const { id: userId, name } = socket.user;

    // Track presence
    online[socket.id] = { userId, name };
    broadcastPresence(io);
    console.log(`[socket] ${name} connected (${socket.id})`);

    // Client sends its channel list so we can put it in the right rooms
    socket.on("join:channels", (channelIds) => {
      if (!Array.isArray(channelIds)) return;
      channelIds.forEach((id) => socket.join(`channel:${id}`));
    });

    // Client sends a message
    socket.on("message:send", async ({ channelId, content, fileUrl, fileName }) => {
      if (!channelId) return;
      if (!content?.trim() && !fileUrl) return;

      try {
        const { rows } = await db.query(
          `INSERT INTO messages (channel_id, user_id, content, file_url, file_name)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, channel_id, content, file_url, file_name, created_at`,
          [channelId, userId, content?.trim() || null, fileUrl || null, fileName || null]
        );

        const msg = {
          ...rows[0],
          user_id:   userId,
          user_name: name,
        };

        io.to(`channel:${channelId}`).emit("message:new", msg);
      } catch (e) {
        socket.emit("error", { message: "Failed to send message" });
        console.error("[socket] message:send error", e.message);
      }
    });

    // Typing indicators — broadcast to channel, not back to sender
    socket.on("typing:start", ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit("typing:start", { userId, name, channelId });
    });

    socket.on("typing:stop", ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit("typing:stop", { userId, channelId });
    });

    socket.on("disconnect", () => {
      delete online[socket.id];
      broadcastPresence(io);
      console.log(`[socket] ${name} disconnected`);
    });
  });
}

function broadcastPresence(io) {
  // Deduplicate by userId (same user on multiple tabs = one entry)
  const seen = new Set();
  const unique = Object.values(online).filter(({ userId }) => {
    if (seen.has(userId)) return false;
    seen.add(userId);
    return true;
  });
  io.emit("presence", unique);
}
