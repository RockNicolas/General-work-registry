import * as XLSX from "xlsx";
import { decodificarTexto, parseCsv } from "./csv";
import { type DatasetKey, MODELO, datasetDaAba, mapaDeCabecalhos, normalizarChave } from "./modelo";

export const LIMITE_BYTES = 10 * 1024 * 1024; // 10 MB
export const LIMITE_LINHAS = 20_000;

export type LinhaCrua = {
  /** Número da linha na planilha (1 = primeira linha), para o usuário localizar o problema. */
  numero: number;
  valores: Record<string, unknown>;
};

export type FolhaCrua = {
  dataset: DatasetKey;
  aba: string;
  /** Colunas obrigatórias que não existem no cabeçalho. */
  colunasAusentes: string[];
  /** Cabeçalhos presentes que não pertencem ao modelo (ignorados). */
  colunasIgnoradas: string[];
  linhas: LinhaCrua[];
};

export type ArquivoCru = {
  folhas: FolhaCrua[];
  /** Problemas que impedem a leitura (formato, abas, limites). */
  erros: string[];
};

type Celula = unknown;

const vazia = (linha: Celula[]) => linha.every((c) => c === null || c === undefined || (typeof c === "string" && c.trim() === ""));

/** Procura o cabeçalho nas primeiras linhas (aceita linhas em branco/títulos acima). */
function montarFolha(dataset: DatasetKey, aba: string, linhas: Celula[][]): FolhaCrua {
  const mapa = mapaDeCabecalhos(dataset);
  const obrigatorias = MODELO[dataset].colunas.filter((c) => c.obrigatoria).map((c) => c.chave);

  let indiceCabecalho = -1;
  for (let i = 0; i < Math.min(linhas.length, 10); i++) {
    const reconhecidos = (linhas[i] ?? []).filter((c) => typeof c === "string" && mapa.has(normalizarChave(c))).length;
    if (reconhecidos >= 2) {
      indiceCabecalho = i;
      break;
    }
  }
  if (indiceCabecalho === -1) {
    return { dataset, aba, colunasAusentes: obrigatorias, colunasIgnoradas: [], linhas: [] };
  }

  const cabecalho = linhas[indiceCabecalho]!;
  const chaves: (string | null)[] = cabecalho.map((c) => (typeof c === "string" ? (mapa.get(normalizarChave(c)) ?? null) : null));
  const ignoradas = cabecalho.filter((c, i) => typeof c === "string" && c.trim() !== "" && chaves[i] === null).map(String);
  const presentes = new Set(chaves.filter((c): c is string => c !== null));

  const resultado: LinhaCrua[] = [];
  for (let i = indiceCabecalho + 1; i < linhas.length; i++) {
    const linha = linhas[i]!;
    if (vazia(linha)) continue;
    const valores: Record<string, unknown> = {};
    chaves.forEach((chave, col) => {
      // Se a mesma coluna aparece duas vezes, vale a primeira com conteúdo.
      if (chave && (valores[chave] === undefined || valores[chave] === null || valores[chave] === "")) valores[chave] = linha[col] ?? null;
    });
    resultado.push({ numero: i + 1, valores });
  }

  return {
    dataset,
    aba,
    colunasAusentes: obrigatorias.filter((o) => !presentes.has(o)),
    colunasIgnoradas: ignoradas,
    linhas: resultado,
  };
}

const ERRO_XLSX = "Não foi possível abrir o arquivo. Ele precisa ser um .xlsx válido (não use .xls).";

function lerXlsx(bytes: Uint8Array): ArquivoCru {
  // .xlsx é um ZIP ("PK"). O SheetJS tenta adivinhar o formato de qualquer coisa; exigir a
  // assinatura evita que texto, HTML ou .xls disfarçados de .xlsx cheguem ao parser.
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { folhas: [], erros: [ERRO_XLSX] };

  let livro: XLSX.WorkBook;
  try {
    livro = XLSX.read(bytes, { type: "array", cellNF: true, cellDates: false, sheetRows: LIMITE_LINHAS + 12 });
  } catch {
    return { folhas: [], erros: [ERRO_XLSX] };
  }

  const folhas: FolhaCrua[] = [];
  const erros: string[] = [];

  for (const nome of livro.SheetNames) {
    const dataset = datasetDaAba(nome);
    if (!dataset) continue; // abas de instruções ou outras são ignoradas
    const ws = livro.Sheets[nome];
    if (!ws || !ws["!ref"]) {
      folhas.push({ dataset, aba: nome, colunasAusentes: [], colunasIgnoradas: [], linhas: [] });
      continue;
    }

    const intervalo = XLSX.utils.decode_range(ws["!ref"]);
    const linhas: Celula[][] = [];
    for (let r = intervalo.s.r; r <= intervalo.e.r; r++) {
      const linha: Celula[] = [];
      for (let c = intervalo.s.c; c <= intervalo.e.c; c++) {
        const cel = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
        if (!cel || cel.v === undefined || cel.v === null) {
          linha.push(null);
        } else if (cel.t === "e") {
          linha.push(`#ERRO(${String(cel.w ?? cel.v)})`);
        } else if (cel.t === "n" && typeof cel.v === "number" && typeof cel.z === "string" && cel.z.includes("%")) {
          // Célula formatada como porcentagem guarda a fração (0,125 = 12,5%): volta para a escala 0–100.
          linha.push(Math.round(cel.v * 100 * 1_000_000) / 1_000_000);
        } else {
          linha.push(cel.v);
        }
      }
      linhas.push(linha);
    }
    if (linhas.length > LIMITE_LINHAS + 10) {
      erros.push(`A aba "${nome}" passa do limite de ${LIMITE_LINHAS.toLocaleString("pt-BR")} linhas. Divida o arquivo.`);
      continue;
    }
    folhas.push(montarFolha(dataset, nome, linhas));
  }

  if (folhas.length === 0 && erros.length === 0) {
    erros.push(
      'Nenhuma aba reconhecida. Use o modelo: as abas devem se chamar "Lancamentos", "Orcamento" e/ou "AvancoFisico".',
    );
  }
  return { folhas, erros };
}

function lerCsv(bytes: Uint8Array, dataset: DatasetKey | undefined): ArquivoCru {
  if (!dataset) {
    return { folhas: [], erros: ["Para arquivos .csv, informe qual conjunto de dados está sendo importado."] };
  }
  const linhas = parseCsv(decodificarTexto(bytes));
  if (linhas.length > LIMITE_LINHAS + 10) {
    return { folhas: [], erros: [`O arquivo passa do limite de ${LIMITE_LINHAS.toLocaleString("pt-BR")} linhas. Divida o arquivo.`] };
  }
  return { folhas: [montarFolha(dataset, "CSV", linhas)], erros: [] };
}

/**
 * Lê .xlsx (várias abas, cada uma um dataset) ou .csv (um dataset, informado). Não valida o
 * conteúdo das células: só localiza cabeçalhos e devolve as linhas cruas.
 */
export function lerArquivo(bytes: Uint8Array, nomeArquivo: string, datasetCsv?: DatasetKey): ArquivoCru {
  const nome = nomeArquivo.toLowerCase();
  if (bytes.byteLength === 0) return { folhas: [], erros: ["O arquivo está vazio."] };
  if (bytes.byteLength > LIMITE_BYTES) return { folhas: [], erros: ["O arquivo passa do limite de 10 MB."] };
  if (nome.endsWith(".xlsx")) return lerXlsx(bytes);
  if (nome.endsWith(".csv")) return lerCsv(bytes, datasetCsv);
  return { folhas: [], erros: ["Formato não suportado. Envie um arquivo .xlsx ou .csv (veja o modelo)."] };
}
