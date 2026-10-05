import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Servidor que imita a API do Sienge (rotas, Basic Auth, paginação e formatos dos OpenAPI de
 * api.sienge.com.br/docs) para testar a integração SEM credenciais reais. Falhas (429/500) podem
 * ser injetadas para exercitar retry e backoff.
 */
export type DadosFakeSienge = {
  empreendimentos: Record<string, unknown>[];
  parcelasPagar: Record<string, unknown>[];
  parcelasReceber: Record<string, unknown>[];
  itensOrcamento: Record<string, unknown>[];
};

export type FakeSienge = {
  /** Base para usar como "endereço" da integração (com permitirCustom). */
  url: string;
  subdominio: string;
  dados: DadosFakeSienge;
  /** Quantas requisições chegaram, por caminho (sem o prefixo). */
  chamadas: Map<string, number>;
  /** Todas as requisições, na ordem (caminho + query). */
  log: { caminho: string; query: URLSearchParams; em: number }[];
  /** Falhas a injetar nas PRÓXIMAS requisições (decrementa a cada uso). */
  falhas: { http429?: number; http500?: number; retryAfter?: number };
  hooks: { id: string; url: string; events: string[] }[];
  fechar: () => Promise<void>;
};

export const CREDENCIAIS_FAKE = { usuario: "api-teste", senha: "senha-da-api" };

const json = (res: ServerResponse, status: number, corpo: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(corpo));
};

const dentro = (data: unknown, inicio: string, fim: string) => typeof data === "string" && data.slice(0, 10) >= inicio && data.slice(0, 10) <= fim;

export async function iniciarFakeSienge(subdominio = "demo"): Promise<FakeSienge> {
  const estado: FakeSienge = {
    url: "",
    subdominio,
    dados: { empreendimentos: [], parcelasPagar: [], parcelasReceber: [], itensOrcamento: [] },
    chamadas: new Map(),
    log: [],
    falhas: {},
    hooks: [],
    fechar: async () => undefined,
  };

  const tratar = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const prefixo = `/${subdominio}/public/api`;
    if (!url.pathname.startsWith(prefixo)) return json(res, 404, { status: 404, developerMessage: "rota desconhecida" });
    const caminho = url.pathname.slice(prefixo.length);

    estado.chamadas.set(caminho, (estado.chamadas.get(caminho) ?? 0) + 1);
    estado.log.push({ caminho, query: url.searchParams, em: Date.now() });

    const esperado = `Basic ${Buffer.from(`${CREDENCIAIS_FAKE.usuario}:${CREDENCIAIS_FAKE.senha}`).toString("base64")}`;
    if (req.headers.authorization !== esperado) return json(res, 401, { status: 401, developerMessage: "Unauthorized" });

    if (estado.falhas.http429 && estado.falhas.http429 > 0) {
      estado.falhas.http429--;
      return json(res, 429, { status: 429, developerMessage: "Too many requests" }, { "Retry-After": String(estado.falhas.retryAfter ?? 0) });
    }
    if (estado.falhas.http500 && estado.falhas.http500 > 0) {
      estado.falhas.http500--;
      return json(res, 500, { status: 500, developerMessage: "Erro interno" });
    }

    const { dados } = estado;

    if (req.method === "GET" && caminho === "/v1/enterprises") {
      const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 100));
      const offset = Number(url.searchParams.get("offset") ?? 0);
      return json(res, 200, {
        resultSetMetadata: { count: dados.empreendimentos.length, offset, limit },
        results: dados.empreendimentos.slice(offset, offset + limit),
      });
    }

    if (req.method === "GET" && (caminho === "/bulk-data/v1/outcome" || caminho === "/bulk-data/v1/income")) {
      const pagar = caminho.endsWith("outcome");
      const q = url.searchParams;
      for (const obrigatorio of pagar ? ["startDate", "endDate", "selectionType", "correctionIndexerId", "correctionDate"] : ["startDate", "endDate", "selectionType"]) {
        if (!q.get(obrigatorio)) return json(res, 400, { status: 400, developerMessage: `parâmetro obrigatório ausente: ${obrigatorio}` });
      }
      const campoData = ({ I: "issueDate", D: "dueDate", B: "billDate" } as Record<string, string>)[q.get("selectionType")!.toUpperCase()] ?? "billDate";
      const lista = (pagar ? dados.parcelasPagar : dados.parcelasReceber).filter((p) => dentro(p[campoData], q.get("startDate")!, q.get("endDate")!));
      // Como o Sienge real: nenhuma parcela => 404.
      if (lista.length === 0) return json(res, 404, { status: 404, developerMessage: "Parcelas não encontradas", clientMessage: "Nenhuma parcela encontrada." });
      return json(res, 200, { data: lista });
    }

    if (req.method === "GET" && caminho === "/bulk-data/v1/building-cost-estimation-items") {
      const obra = url.searchParams.get("buildingId");
      const itens = dados.itensOrcamento.filter((i) => !obra || String(i.buildingId) === obra);
      return json(res, 200, { data: itens });
    }

    if (caminho === "/v1/hooks") {
      if (req.method === "GET") return json(res, 200, { resultSetMetadata: { count: estado.hooks.length, offset: 0, limit: 100 }, results: estado.hooks });
      if (req.method === "POST") {
        const corpo = JSON.parse(await lerCorpo(req)) as { url: string; events: string[] };
        const hook = { id: `hook-${estado.hooks.length + 1}`, url: corpo.url, events: corpo.events };
        estado.hooks.push(hook);
        return json(res, 200, hook);
      }
    }

    return json(res, 404, { status: 404, developerMessage: "rota desconhecida" });
  };

  const servidor: Server = createServer((req, res) => {
    tratar(req, res).catch((e) => json(res, 500, { status: 500, developerMessage: String(e) }));
  });
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const { port } = servidor.address() as AddressInfo;
  estado.url = `http://127.0.0.1:${port}/${subdominio}`;
  estado.fechar = () => new Promise((resolve) => servidor.close(() => resolve()));
  return estado;
}

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let texto = "";
    req.on("data", (c) => (texto += c));
    req.on("end", () => resolve(texto));
    req.on("error", reject);
  });
}

// ---------- Fábricas de dados (no formato dos OpenAPI do Sienge) ----------

export const empreendimento = (id: number, nome: string, type = "1") => ({
  id,
  name: nome,
  commercialName: nome,
  type,
  companyId: 1,
  companyName: "Construtora Demo",
});

export const parcelaPagarFake = (installmentId: number, extra: Record<string, unknown> = {}) => ({
  companyId: 1,
  billId: installmentId * 10,
  installmentId,
  creditorName: "Fornecedor Teste",
  documentIdentificationId: "NF",
  documentNumber: String(installmentId),
  forecastDocument: null,
  originalAmount: 1000,
  balanceAmount: 0,
  dueDate: "2026-03-20",
  issueDate: "2026-03-05",
  billDate: "2026-03-01",
  paymentsCategories: [{ costCenterId: 101, financialCategoryId: "2.01.01", financialCategoryName: "Materiais de construção", financialCategoryRate: 100 }],
  buildingsCosts: [{ buildingId: 101, rate: 100 }],
  payments: [{ sequencialNumber: 1, grossAmount: 1000, netAmount: 1000, paymentDate: "2026-03-18" }],
  ...extra,
});

export const parcelaReceberFake = (installmentId: number, extra: Record<string, unknown> = {}) => ({
  companyId: 1,
  billId: installmentId * 10,
  installmentId,
  clientName: "Cliente Teste",
  documentIdentificationId: "MED",
  documentNumber: String(installmentId),
  documentForecast: "N",
  originalAmount: 5000,
  balanceAmount: 0,
  dueDate: "2026-04-10",
  billDate: "2026-03-31",
  receiptsCategories: [{ costCenterId: 101, financialCategoryId: "1.01.01", financialCategoryName: "Medições", financialCategoryRate: 100 }],
  receipts: [{ operationTypeName: "Recebimento", grossAmount: 5000, netAmount: 5000, paymentDate: "2026-04-05" }],
  ...extra,
});

export const itemOrcamentoFake = (extra: Record<string, unknown>) => ({ buildingId: 101, buildingName: "Obra Demo", versionNumber: 1, ...extra });
