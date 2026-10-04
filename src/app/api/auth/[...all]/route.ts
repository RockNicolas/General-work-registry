import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

// Handlers criados sob demanda: o módulo é carregado no `next build`, quando o .env pode não existir.
export function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
