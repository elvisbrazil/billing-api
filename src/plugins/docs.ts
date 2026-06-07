import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

async function docs(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: { title: "billing-api", version: "0.1.0" },
      tags: [
        { name: "plans" },
        { name: "customers" },
        { name: "subscriptions" },
        { name: "invoices" },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
}

export const registerDocs = fp(docs, { name: "docs" });
