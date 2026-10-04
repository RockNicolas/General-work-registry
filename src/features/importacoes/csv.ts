/**
 * CSV tolerante ao que o Excel brasileiro produz: separador ";" (ou "," / tab), decimal com vírgula,
 * BOM no início e, no "CSV (separado por vírgulas)" clássico, codificação Windows-1252.
 */

/** Decodifica como UTF-8; se houver bytes inválidos, assume Windows-1252. */
export function decodificarTexto(bytes: Uint8Array): string {
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder("windows-1252").decode(bytes);
  }
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/** Escolhe o delimitador pela primeira linha (ignorando o que estiver entre aspas). */
export function detectarDelimitador(texto: string): string {
  const fim = texto.search(/\r?\n/);
  const primeira = fim === -1 ? texto : texto.slice(0, fim);
  const contagem: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let aspas = false;
  for (const c of primeira) {
    if (c === '"') aspas = !aspas;
    else if (!aspas && c in contagem) contagem[c]!++;
  }
  // Empate ou nenhum: ";" (padrão do Excel em português).
  const [melhor] = Object.entries(contagem).sort((a, b) => b[1] - a[1] || (a[0] === ";" ? -1 : 1));
  return melhor && melhor[1] > 0 ? melhor[0] : ";";
}

/** Divide o texto em linhas de campos, respeitando aspas, aspas duplicadas e quebras dentro de campos. */
export function parseCsv(texto: string, delimitador = detectarDelimitador(texto)): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;

  const fecharCampo = () => {
    linha.push(campo);
    campo = "";
  };
  const fecharLinha = () => {
    fecharCampo();
    linhas.push(linha);
    linha = [];
  };

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          aspas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      aspas = true;
    } else if (c === delimitador) {
      fecharCampo();
    } else if (c === "\n") {
      fecharLinha();
    } else if (c === "\r") {
      if (texto[i + 1] === "\n") i++;
      fecharLinha();
    } else {
      campo += c;
    }
  }
  if (campo !== "" || linha.length > 0) fecharLinha();
  return linhas;
}
