import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("aceita caminhos internos", () => {
    expect(safeNextPath("/obras/123?aba=custos")).toBe("/obras/123?aba=custos");
  });

  it.each([null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "obras"])(
    "cai no padrão para %j",
    (valor) => {
      expect(safeNextPath(valor)).toBe("/dashboard");
    },
  );

  it("respeita o fallback informado", () => {
    expect(safeNextPath("http://x", "/inicio")).toBe("/inicio");
  });
});
