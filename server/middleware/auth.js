// Reusable preHandler that protects any route
export async function requireAuth(request, reply) {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: "Unauthorised" });
  }
}
