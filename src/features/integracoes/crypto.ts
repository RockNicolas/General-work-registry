import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Criptografia das credenciais de ERP: AES-256-GCM, chave de 32 bytes em ENCRYPTION_KEY.
 * Formato guardado: "v<versão>.<iv>.<tag>.<texto cifrado>" (base64url). A "versão" permite trocar a
 * chave no futuro sem perder o que já foi gravado. O AAD amarra o texto cifrado ao registro dono
 * (ex.: "integracao:<id>"): copiar o valor para outra linha faz a decifragem falhar.
 */
export const VERSAO_CHAVE_ATUAL = 1;

function chaveDaVersao(versao: number): Buffer {
  // Lê direto do ambiente (sem exigir o resto da configuração) e valida o tamanho.
  const nome = versao === 1 ? "ENCRYPTION_KEY" : `ENCRYPTION_KEY_V${versao}`;
  const base64 = process.env[nome];
  if (!base64) {
    throw new Error(`${nome} não configurada: defina no .env (veja .env.example) antes de usar integrações.`);
  }
  const chave = Buffer.from(base64, "base64");
  if (chave.length !== 32) throw new Error(`${nome} inválida: precisa ter 32 bytes em base64.`);
  return chave;
}

export function criptografar(texto: string, aad: string): { valor: string; versao: number } {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chaveDaVersao(VERSAO_CHAVE_ATUAL), iv);
  cifra.setAAD(Buffer.from(aad));
  const cifrado = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  const partes = [iv, cifra.getAuthTag(), cifrado].map((b) => b.toString("base64url"));
  return { valor: `v${VERSAO_CHAVE_ATUAL}.${partes.join(".")}`, versao: VERSAO_CHAVE_ATUAL };
}

export function descriptografar(valor: string, aad: string): string {
  const m = /^v(\d+)\.([\w-]+)\.([\w-]+)\.([\w-]*)$/.exec(valor);
  if (!m) throw new Error("Credencial em formato desconhecido.");
  const [, versao, iv, tag, cifrado] = m;
  try {
    const decifra = createDecipheriv("aes-256-gcm", chaveDaVersao(Number(versao)), Buffer.from(iv!, "base64url"));
    decifra.setAAD(Buffer.from(aad));
    decifra.setAuthTag(Buffer.from(tag!, "base64url"));
    return Buffer.concat([decifra.update(Buffer.from(cifrado!, "base64url")), decifra.final()]).toString("utf8");
  } catch (erro) {
    // Chave trocada, valor adulterado ou copiado de outro registro: nunca devolve texto parcial.
    if (erro instanceof Error && /ENCRYPTION_KEY/.test(erro.message)) throw erro;
    throw new Error("Não foi possível descriptografar a credencial (chave diferente ou dado alterado).");
  }
}

/** Gera um segredo aleatório para o webhook (mostrado uma única vez ao administrador). */
export function gerarSegredoWebhook(): string {
  return randomBytes(32).toString("base64url");
}

export const hashSegredo = (segredo: string): string => createHash("sha256").update(segredo).digest("hex");

/** Compara o segredo recebido com o hash guardado, em tempo constante. */
export function segredoConfere(recebido: string, hashGuardado: string | null): boolean {
  if (!hashGuardado) return false;
  const a = Buffer.from(hashSegredo(recebido), "hex");
  const b = Buffer.from(hashGuardado, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
