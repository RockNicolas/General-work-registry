export const MIME = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;

export type Formato = keyof typeof MIME;

/** Resposta de download: nunca cacheável (traz dados do usuário) e sem adivinhação de tipo pelo navegador. */
export function respostaArquivo(conteudo: Buffer, nome: string, formato: Formato): Response {
  return new Response(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": MIME[formato],
      "Content-Disposition": `attachment; filename="${nome.replace(/[^\w.-]/g, "_")}"`,
      "Content-Length": String(conteudo.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const respostaErro = (status: number, mensagem: string): Response => Response.json({ error: mensagem }, { status, headers: { "Cache-Control": "no-store" } });
