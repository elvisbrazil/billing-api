import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { ProblemError } from "../errors.js";

interface Problem {
  type?: string;
  status: number;
  title: string;
  detail?: string;
  [extension: string]: unknown;
}

function sendProblem(request: FastifyRequest, reply: FastifyReply, problem: Problem) {
  return reply
    .code(problem.status)
    .type("application/problem+json")
    .send({ type: "about:blank", ...problem, instance: request.url });
}

export function registerProblemDetails(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return sendProblem(request, reply, {
        status: 400,
        title: "Bad Request",
        detail: "Request validation failed",
        errors: error.validation.map((issue) => ({
          path: issue.instancePath,
          message: issue.message,
        })),
      });
    }

    if (error instanceof ProblemError) {
      return sendProblem(request, reply, {
        ...error.extensions,
        type: error.type,
        status: error.status,
        title: error.title,
        detail: error.detail,
      });
    }

    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return sendProblem(request, reply, {
        status: statusCode,
        title: "Bad Request",
        detail: (error as Error).message,
      });
    }

    request.log.error(error);
    return sendProblem(request, reply, { status: 500, title: "Internal Server Error" });
  });

  app.setNotFoundHandler((request, reply) =>
    sendProblem(request, reply, {
      status: 404,
      title: "Not Found",
      detail: `Route ${request.method} ${request.url} not found`,
    }),
  );
}
