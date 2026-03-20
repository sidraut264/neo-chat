import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export async function userRoutes(fastify) {
  // GET /users/me — currently logged in user
  fastify.get(
    "/users/me",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { rows } = await db.query(
        "SELECT id, name, email, created_at FROM users WHERE id = $1",
        [request.user.id]
      );
      if (!rows.length) return reply.code(404).send({ error: "User not found" });
      reply.send(rows[0]);
    }
  );

  // GET /users — everyone except the current user (for the People sidebar)
  fastify.get(
    "/users",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { rows } = await db.query(
        `SELECT id, name, email
         FROM users
         WHERE id != $1
         ORDER BY name ASC`,
        [request.user.id]
      );
      reply.send(rows);
    }
  );
}
