import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type {
  FastifyReply,
  FastifyRequest,
  onSendHookHandler,
  preHandlerHookHandler,
} from "fastify";
import type { Clock } from "../clock.js";
import type { Database } from "../db/client.js";
import { idempotencyKeys } from "../db/schema.js";
import { badRequest, conflict, unprocessable } from "../errors.js";

const HEADER = "idempotency-key";

interface Reservation {
  scope: string;
  key: string;
}

function hashRequest(request: FastifyRequest): string {
  return createHash("sha256")
    .update(JSON.stringify({ url: request.url, body: request.body ?? null }))
    .digest("hex");
}

export interface IdempotencyHooks {
  preHandler: preHandlerHookHandler;
  onSend: onSendHookHandler;
}

export function idempotencyHooks(db: Database, clock: Clock): IdempotencyHooks {
  const reservations = new WeakMap<FastifyRequest, Reservation>();

  const where = ({ scope, key }: Reservation) =>
    and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key));

  async function preHandler(request: FastifyRequest, reply: FastifyReply) {
    const key = request.headers[HEADER];
    if (key === undefined) return;
    if (typeof key !== "string" || key.length === 0 || key.length > 255) {
      throw badRequest("Idempotency-Key must be a non-empty string of up to 255 characters");
    }

    const reservation = { scope: `${request.method} ${request.routeOptions.url}`, key };
    const requestHash = hashRequest(request);

    const [reserved] = await db
      .insert(idempotencyKeys)
      .values({ ...reservation, requestHash, createdAt: clock.now() })
      .onConflictDoNothing()
      .returning();
    if (reserved) {
      reservations.set(request, reservation);
      return;
    }

    const [existing] = await db.select().from(idempotencyKeys).where(where(reservation));
    if (!existing) {
      throw conflict("Idempotency-Key was released concurrently, retry the request");
    }
    if (existing.requestHash !== requestHash) {
      throw unprocessable("Idempotency-Key was already used with a different request");
    }
    if (existing.statusCode === null) {
      throw conflict("A request with this Idempotency-Key is still being processed");
    }

    return reply
      .code(existing.statusCode)
      .header("idempotent-replayed", "true")
      .type(existing.contentType ?? "application/json")
      .send(existing.responseBody);
  }

  async function onSend(request: FastifyRequest, reply: FastifyReply, payload: unknown) {
    const reservation = reservations.get(request);
    if (!reservation) return payload;
    reservations.delete(request);

    if (reply.statusCode >= 500) {
      await db.delete(idempotencyKeys).where(where(reservation));
      return payload;
    }

    await db
      .update(idempotencyKeys)
      .set({
        statusCode: reply.statusCode,
        contentType: String(reply.getHeader("content-type") ?? "application/json"),
        responseBody: typeof payload === "string" ? payload : null,
      })
      .where(where(reservation));
    return payload;
  }

  return { preHandler, onSend };
}
