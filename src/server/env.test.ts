import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("aceita uma DATABASE_URL postgres válida", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://rgo:rgo@localhost:5432/rgo" });
    expect(env.DATABASE_URL).toBe("postgres://rgo:rgo@localhost:5432/rgo");
    expect(env.NODE_ENV).toBe("development");
  });

  it("falha quando DATABASE_URL está ausente", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("falha quando DATABASE_URL não é postgres", () => {
    expect(() => parseEnv({ DATABASE_URL: "mysql://localhost/rgo" })).toThrow(/postgres/);
  });
});
