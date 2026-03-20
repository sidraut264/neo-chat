import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export async function channelRoutes(fastify) {
  // GET /channels — all channels the current user belongs to
  fastify.get(
    "/channels",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { rows } = await db.query(
        `SELECT c.id, c.name, c.is_dm, c.created_at
         FROM channels c
         JOIN channel_members cm ON cm.channel_id = c.id
         WHERE cm.user_id = $1
         ORDER BY c.is_dm ASC, c.name ASC`,
        [request.user.id]
      );
      reply.send(rows);
    }
  );

  // POST /channels — create a new group channel
  fastify.post(
    "/channels",
    {
      preHandler: requireAuth,
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 80 },
          },
        },
      },
    },
    async (request, reply) => {
      const name = request.body.name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-");

      const { rows } = await db.query(
        "INSERT INTO channels (name) VALUES ($1) RETURNING *",
        [name]
      );
      const channel = rows[0];

      // Add every existing user to the new channel
      const { rows: users } = await db.query("SELECT id FROM users");
      for (const u of users) {
        await db.query(
          `INSERT INTO channel_members (channel_id, user_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [channel.id, u.id]
        );
      }

      reply.code(201).send(channel);
    }
  );

  // POST /channels/dm — start or retrieve a DM between two users
  fastify.post(
    "/channels/dm",
    {
      preHandler: requireAuth,
      schema: {
        body: {
          type: "object",
          required: ["userId"],
          properties: {
            userId: { type: "integer" },
          },
        },
      },
    },
    async (request, reply) => {
      const myId = request.user.id;
      const { userId } = request.body;

      if (myId === userId) {
        return reply.code(400).send({ error: "Cannot DM yourself" });
      }

      // Return existing DM if one already exists
      const { rows: existing } = await db.query(
        `SELECT c.id, c.name, c.is_dm
         FROM channels c
         JOIN channel_members a ON a.channel_id = c.id AND a.user_id = $1
         JOIN channel_members b ON b.channel_id = c.id AND b.user_id = $2
         WHERE c.is_dm = TRUE`,
        [myId, userId]
      );
      if (existing.length > 0) return reply.send(existing[0]);

      // Create a new DM channel
      const [{ rows: meRows }, { rows: otherRows }] = await Promise.all([
        db.query("SELECT name FROM users WHERE id = $1", [myId]),
        db.query("SELECT name FROM users WHERE id = $1", [userId]),
      ]);

      if (!otherRows.length) {
        return reply.code(404).send({ error: "User not found" });
      }

      const dmName = `${meRows[0].name}, ${otherRows[0].name}`;
      const { rows } = await db.query(
        "INSERT INTO channels (name, is_dm) VALUES ($1, TRUE) RETURNING *",
        [dmName]
      );
      const channel = rows[0];

      await db.query(
        `INSERT INTO channel_members (channel_id, user_id)
         VALUES ($1, $2), ($1, $3)`,
        [channel.id, myId, userId]
      );

      reply.code(201).send(channel);
    }
  );
}
