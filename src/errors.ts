export class ProblemError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
    readonly extensions: Record<string, unknown> = {},
    readonly type = "about:blank",
  ) {
    super(detail ?? title);
    this.name = "ProblemError";
  }
}

export const notFound = (detail: string) => new ProblemError(404, "Not Found", detail);

export const conflict = (detail: string, extensions?: Record<string, unknown>) =>
  new ProblemError(409, "Conflict", detail, extensions);

export const unprocessable = (detail: string, extensions?: Record<string, unknown>) =>
  new ProblemError(422, "Unprocessable Content", detail, extensions);
