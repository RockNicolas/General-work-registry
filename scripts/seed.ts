import { inArray, like } from "drizzle-orm";
import { upsertUsuarioCredencial } from "../src/server/auth-users";
import { getDb, getPool } from "../src/server/db/client";
import {
  auditoria,
  avancoFisico,
  categoria,
  etapa,
  lancamento,
  member,
  obra,
  obraAcesso,
  orcamento,
  organization,
  user,
} from "../src/server/db/schema";
import { CATEGORIAS_PADRAO } from "../src/features/categorias/service";
import { EMPRESAS, ETAPAS, OBRAS, SUBETAPAS, gerarObra, somaMeses } from "./seed-data";

/**
 * Dados fictícios para ver o sistema funcionando.
 *   pnpm db:seed             cria (não faz nada se já existirem)
 *   pnpm db:seed --limpar    remove os dados de demonstração
 * Recusa rodar em banco com empresas reais (qualquer empresa que não seja demo-/e2e-).
 */
const SENHA_DEMO = "Demo@12345";
const USUARIOS = [
  { email: "admin@rgo.demo", nome: "Administrador Demo", role: "admin" as const },
  { email: "aurora@rgo.demo", nome: "Ana Aurora", role: "user" as const },
  { email: "horizonte@rgo.demo", nome: "Hugo Horizonte", role: "user" as const },
  { email: "cliente@rgo.demo", nome: "Carla Cliente", role: "user" as const },
];

const idsDemo = EMPRESAS.map((e) => e.id);
const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function limpar() {
  const db = getDb();
  await db.delete(lancamento).where(inArray(lancamento.empresaId, idsDemo));
  await db.delete(obra).where(inArray(obra.empresaId, idsDemo)); // cascata: etapa, orcamento, avanco, obra_acesso
  await db.delete(categoria).where(inArray(categoria.empresaId, idsDemo));
  await db.delete(auditoria).where(inArray(auditoria.empresaId, idsDemo));
  await db.delete(organization).where(inArray(organization.id, idsDemo)); // cascata: member
  await db.delete(user).where(like(user.email, "%@rgo.demo"));
  console.log("Dados de demonstração removidos.");
}

async function criar() {
  const db = getDb();

  const existentes = await db.select({ id: organization.id }).from(organization).where(inArray(organization.id, idsDemo));
  if (existentes.length > 0) {
    console.log("Os dados de demonstração já existem. Rode `pnpm db:seed --limpar` para recriar.");
    return;
  }

  // 1) Empresas e usuários
  await db.insert(organization).values(
    EMPRESAS.map((e) => ({ id: e.id, name: e.nome, slug: e.id, razaoSocial: e.razaoSocial, cnpj: e.cnpj, ativo: true, createdAt: new Date() })),
  );
  const usuarioId: Record<string, string> = {};
  for (const u of USUARIOS) {
    usuarioId[u.email] = (
      await upsertUsuarioCredencial({ email: u.email, name: u.nome, password: SENHA_DEMO, role: u.role })
    ).id;
  }
  const vinculo = (email: string, empresaId: string, role: "empresa" | "cliente") => ({
    id: `demo-m-${email.split("@")[0]}-${empresaId}`,
    organizationId: empresaId,
    userId: usuarioId[email]!,
    role,
    createdAt: new Date(),
  });
  await db.insert(member).values([
    vinculo("aurora@rgo.demo", "demo-aurora", "empresa"),
    vinculo("horizonte@rgo.demo", "demo-horizonte", "empresa"),
    vinculo("cliente@rgo.demo", "demo-aurora", "cliente"),
    vinculo("cliente@rgo.demo", "demo-horizonte", "cliente"),
  ]);

  // 2) Categorias (padrão) por empresa: grupo -> id
  const categoriaPorEmpresa = new Map<string, Map<string, string>>();
  for (const e of EMPRESAS) {
    const criadas = await db
      .insert(categoria)
      .values(CATEGORIAS_PADRAO.map((c) => ({ empresaId: e.id, ...c })))
      .returning({ id: categoria.id, grupo: categoria.grupo });
    categoriaPorEmpresa.set(e.id, new Map(criadas.map((c) => [c.grupo, c.id])));
  }

  // 3) Obras, etapas, orçamento, avanço e lançamentos
  const obraIdPorCodigo = new Map<string, string>();
  let totalLancamentos = 0;

  for (const o of OBRAS) {
    const empresa = EMPRESAS.find((e) => e.key === o.empresa)!;
    const [criada] = await db
      .insert(obra)
      .values({
        empresaId: empresa.id,
        codigo: o.codigo,
        nome: o.nome,
        status: o.status,
        dataInicio: `${o.inicio}-01`,
        dataFimPrevista: `${somaMeses(o.inicio, o.meses)}-01`,
        cidade: o.cidade,
        uf: o.uf,
      })
      .returning({ id: obra.id });
    const obraId = criada!.id;
    obraIdPorCodigo.set(o.codigo, obraId);

    const etapasCriadas = await db
      .insert(etapa)
      .values(ETAPAS.map((e) => ({ empresaId: empresa.id, obraId, codigo: e.codigo, nome: e.nome })))
      .returning({ id: etapa.id, codigo: etapa.codigo });
    const etapaId = new Map(etapasCriadas.map((e) => [e.codigo, e.id]));
    const filhas = await db
      .insert(etapa)
      .values(
        SUBETAPAS.map((s) => ({ empresaId: empresa.id, obraId, codigo: s.codigo, nome: s.nome, paiId: etapaId.get(s.pai)! })),
      )
      .returning({ id: etapa.id, codigo: etapa.codigo });
    for (const f of filhas) etapaId.set(f.codigo, f.id);

    const dados = gerarObra(o);
    const categorias = categoriaPorEmpresa.get(empresa.id)!;

    await db.insert(orcamento).values(
      dados.orcamento.map((i) => ({
        empresaId: empresa.id,
        obraId,
        etapaId: i.etapaCodigo ? etapaId.get(i.etapaCodigo)! : null,
        categoriaId: categorias.get(i.categoriaGrupo)!,
        valorPrevistoCentavos: i.valorCentavos,
        versao: 1,
        vigente: true,
        descricao: i.etapaCodigo ? null : "Custo da obra (sem etapa)",
      })),
    );

    if (dados.avanco.length > 0) {
      await db.insert(avancoFisico).values(
        dados.avanco.map((a) => ({ empresaId: empresa.id, obraId, versao: 0, ...a })),
      );
    }

    for (const parte of chunk(dados.lancamentos, 400)) {
      await db.insert(lancamento).values(
        parte.map((l) => ({
          empresaId: empresa.id,
          obraId,
          etapaId: etapaId.get(l.etapaCodigo)!,
          categoriaId: categorias.get(l.categoriaGrupo)!,
          tipo: l.tipo,
          situacao: l.situacao,
          classe: l.classe,
          isPrevisao: l.isPrevisao,
          valorCentavos: l.valorCentavos,
          dataCompetencia: l.dataCompetencia,
          dataVencimento: l.dataVencimento,
          dataLiquidacao: l.dataLiquidacao,
          contraparte: l.contraparte,
          documento: l.documento,
          descricao: l.descricao,
          origem: l.origem,
          idOrigem: l.idOrigem,
        })),
      );
    }
    totalLancamentos += dados.lancamentos.length;
    console.log(`  ${o.codigo} ${o.nome}: ${dados.lancamentos.length} lançamentos`);
  }

  // 4) O cliente demo enxerga só 3 das obras
  const liberadas = [
    ["AUR-001", "demo-aurora"],
    ["AUR-002", "demo-aurora"],
    ["HOR-001", "demo-horizonte"],
  ] as const;
  await db.insert(obraAcesso).values(
    liberadas.map(([codigo, empresaId]) => ({ usuarioId: usuarioId["cliente@rgo.demo"]!, obraId: obraIdPorCodigo.get(codigo)!, empresaId })),
  );

  await db.insert(auditoria).values({
    acao: "criar",
    entidade: "seed",
    resumo: "Dados de demonstração criados",
    usuarioNome: "Sistema",
  });

  console.log(`\nPronto: ${EMPRESAS.length} empresas, ${OBRAS.length} obras, ${totalLancamentos} lançamentos.`);
  console.log("\nLogins de demonstração (senha de todos: " + SENHA_DEMO + "):");
  console.log("  admin@rgo.demo       Administrador (vê tudo)");
  console.log("  aurora@rgo.demo      Empresa: Construtora Aurora");
  console.log("  horizonte@rgo.demo   Empresa: Engenharia Horizonte");
  console.log("  cliente@rgo.demo     Cliente: só AUR-001, AUR-002 e HOR-001");
}

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    // sem .env
  }
  if (process.env.NODE_ENV === "production") {
    console.error("Recusado: NODE_ENV=production. O seed é só para desenvolvimento.");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (url) console.log(`Banco: ${new URL(url).hostname}\n`);

  const db = getDb();
  const todas = await db.select({ id: organization.id, nome: organization.name }).from(organization);
  // Dados de teste conhecidos: demo (seed), e2e (ids fixos ou criadas pela interface, nome "E2E ...") e fixtures.
  const ehTeste = (o: { id: string; nome: string }) =>
    o.id.startsWith("demo-") || o.id.startsWith("e2e-") || o.nome.startsWith("E2E ") || /^t[0-9a-f]{10}-/.test(o.id);
  const naoDemo = todas.filter((o) => !ehTeste(o));
  if (naoDemo.length > 0 && !process.argv.includes("--forcar")) {
    console.error(
      `Recusado: este banco tem empresas que não são de demonstração (${naoDemo
        .slice(0, 3)
        .map((o) => o.nome)
        .join(", ")}${naoDemo.length > 3 ? "..." : ""}).\n` + "O seed é só para bancos de desenvolvimento. Use --forcar se tiver certeza.",
    );
    process.exit(1);
  }

  if (process.argv.includes("--limpar")) await limpar();
  else await criar();
}

main()
  .then(async () => {
    await getPool().end();
    process.exit(0);
  })
  .catch((error) => {
    console.error("Falha no seed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
