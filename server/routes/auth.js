import bcrypt from "bcryptjs";
import { db } from "../db.js";

export async function authRoutes(fastify) {
  // POST /auth/register
  fastify.post(
    "/auth/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "email", "password"],
          properties: {
            name:     { type: "string", minLength: 1, maxLength: 80 },
            email:    { type: "string", format: "email" },
            password: { type: "string", minLength: 6 },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, email, password } = request.body;

      const hash = await bcrypt.hash(password, 10);

      let user;
      try {
        const { rows } = await db.query(
          `INSERT INTO users (name, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, name, email`,
          [name, email, hash]
        );
        user = rows[0];
      } catch (e) {
        if (e.code === "23505")
          return reply.code(409).send({ error: "Email already registered" });
        throw e;
      }

      // Add new user to every existing non-DM channel
      const { rows: channels } = await db.query(
        "SELECT id FROM channels WHERE is_dm = FALSE"
      );
      for (const ch of channels) {
        await db.query(
          `INSERT INTO channel_members (channel_id, user_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [ch.id, user.id]
        );
      }

      const token = fastify.jwt.sign(
        { id: user.id, name: user.name, email: user.email },
        { expiresIn: "7d" }
      );

      reply.code(201).send({ token, user });
    }
  );

  // POST /auth/login
  fastify.post(
    "/auth/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email:    { type: "string", format: "email" },
            password: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const { rows } = await db.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
      );
      const user = rows[0];

      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return reply.code(401).send({ error: "Invalid email or password" });
      }

      const token = fastify.jwt.sign(
        { id: user.id, name: user.name, email: user.email },
        { expiresIn: "7d" }
      );

      reply.send({
        token,
        user: { id: user.id, name: user.name, email: user.email },
      });
    }
  );
}
