import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const base = {
  DATABASE_URL: "postgres://rgo:rgo@localhost:5432/rgo",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("aceita uma configuração válida e aplica os padrões", () => {
    const env = parseEnv(base);
    expect(env.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(env.NODE_ENV).toBe("development");
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:3000");
  });

  it("falha quando DATABASE_URL está ausente", () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it("falha quando DATABASE_URL não é postgres", () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: "mysql://localhost/rgo" })).toThrow(/postgres/);
  });

  it("falha quando o segredo de autenticação é curto", () => {
    expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: "curto" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("falha quando BETTER_AUTH_URL não é uma URL", () => {
    expect(() => parseEnv({ ...base, BETTER_AUTH_URL: "localhost" })).toThrow(/BETTER_AUTH_URL/);
  });
});
