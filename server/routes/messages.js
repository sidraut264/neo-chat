import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export async function messageRoutes(fastify) {
  // GET /channels/:id/messages — last 50 messages in a channel
  fastify.get(
    "/channels/:id/messages",
    {
      preHandler: requireAuth,
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "integer" } },
        },
        querystring: {
          type: "object",
          properties: {
            before: { type: "integer" }, // message id for pagination
            limit:  { type: "integer", minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const channelId = request.params.id;
      const { before, limit = 50 } = request.query;

      // Verify the requesting user is a member of this channel
      const { rows: membership } = await db.query(
        `SELECT 1 FROM channel_members
         WHERE channel_id = $1 AND user_id = $2`,
        [channelId, request.user.id]
      );
      if (!membership.length) {
        return reply.code(403).send({ error: "Not a member of this channel" });
      }

      const { rows } = await db.query(
        `SELECT
           m.id, m.channel_id, m.content, m.file_url, m.file_name, m.created_at,
           u.id   AS user_id,
           u.name AS user_name
         FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.channel_id = $1
           ${before ? "AND m.id < $3" : ""}
         ORDER BY m.created_at DESC
         LIMIT $2`,
        before ? [channelId, limit, before] : [channelId, limit]
      );

      // Return oldest-first so the UI can render top-to-bottom
      reply.send(rows.reverse());
    }
  );

  // DELETE /messages/:id — delete own message
  fastify.delete(
    "/messages/:id",
    {
      preHandler: requireAuth,
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "integer" } },
        },
      },
    },
    async (request, reply) => {
      const { rows } = await db.query(
        "SELECT user_id, channel_id FROM messages WHERE id = $1",
        [request.params.id]
      );

      if (!rows.length) {
        return reply.code(404).send({ error: "Message not found" });
      }
      if (rows[0].user_id !== request.user.id) {
        return reply.code(403).send({ error: "Cannot delete someone else's message" });
      }

      await db.query("DELETE FROM messages WHERE id = $1", [request.params.id]);

      // Notify channel members via socket (handled in socket layer)
      fastify.io.to(`channel:${rows[0].channel_id}`).emit("message:deleted", {
        id: request.params.id,
        channelId: rows[0].channel_id,
      });

      reply.code(204).send();
    }
  );
}
