import type { ZodError } from "zod";

/** Resultado padrão das Server Actions: nunca lançam para o cliente, sempre devolvem isto. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok(): ActionResult<void>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | void> {
  return { ok: true, data: data as T };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Converte erros do Zod em mensagem geral + mensagem por campo (caminho "a.b.c"). */
export function failFromZod(error: ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fail("Confira os campos destacados.", fieldErrors);
}

/** Erro de regra de negócio com mensagem pronta para o usuário (e, opcionalmente, por campo). */
export class ActionError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}
