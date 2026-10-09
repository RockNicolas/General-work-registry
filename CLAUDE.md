@AGENTS.md

# RGO — Registro Geral de Obra

Sistema web que une financeiro e custos de obras, com dashboards para a diretoria: custo, receita e margem por obra, por empresa e consolidado. Dados vêm de ERPs (Sienge primeiro, depois UAU) e de planilhas em modelo padrão. Interface e mensagens em **pt-BR**.

## Comandos

```
pnpm dev            # Next em http://localhost:3000 (precisa de DATABASE_URL no .env: branch develop do Neon)
pnpm check          # lint + typecheck + testes unitários — rodar ao fim de cada fase
pnpm test:e2e       # Playwright (sobe o dev server sozinho; precisa do banco)
pnpm db:generate    # gera migration a partir de src/server/db/schema
pnpm db:migrate     # aplica migrations
pnpm worker         # processo pg-boss (separado do Next)
```

`pnpm typecheck` roda `next typegen` antes do `tsc` (os tipos `LayoutProps`/`PageProps` são gerados).
O Next 16 não tem mais `next lint`: o lint é `eslint` direto.

## Decisões de produto já aprovadas

- **Só Next.js 16** (App Router + Server Actions). Nada de SPA Vite.
- Perfis: **Administrador** (global; único que cria/edita/importa/sincroniza), **Empresa** (somente leitura, só as próprias obras), **Cliente contratado** (somente leitura, só obras vinculadas; pode ter vínculo com mais de uma empresa).
- Empresa = `organization` do Better Auth (com campos extras).
- Saldos de pedidos/contratos, estoque e fluxo de caixa projetado ficam na **Fase 8** (pós-MVP).
- Trabalho em fases; ao fim de cada uma: `pnpm check` (+ e2e quando houver UI), commit em `develop` e resumo. O usuário autorizou seguir para as fases seguintes sem aguardar aprovação a cada uma (só parar se houver bloqueio real); o merge `develop` → `main` continua dependendo dele.

## Git e ambientes

| Git | Banco (Neon) | Uso |
|---|---|---|
| `main` | branch padrão (produção) | só recebe fase aprovada; **nunca** usado em dev/teste |
| `develop` | branch `develop` | trabalho do dia a dia, migrations de teste, suíte de testes |

- Dev e testes usam **somente** a conexão do branch `develop` (direta, sem `-pooler`).
- A URL de produção vive apenas nas variáveis de ambiente da hospedagem. Nunca em arquivo, commit ou log.
- Migrations: testar primeiro no `develop`; só depois aplicar na produção.
- Fluxo: trabalhar em `develop`; ao aprovar uma fase, merge `develop` → `main`.

## Convenções

**Dinheiro e números**
- Valores em **centavos, inteiro** (`number` no app, `bigint` no Postgres). Nunca float. `src/lib/money.ts` formata/lê pt-BR.
- Percentuais em pontos-base (inteiro), nunca `0.1 + 0.2`.

**Datas**
- Datas de negócio (competência, vencimento, pagamento) são `date` puro, trafegam como `"YYYY-MM-DD"`, sem `Date`/fuso. Instantes (criado_em, auditoria) são `Date`, exibidos em `America/Sao_Paulo`. Ver `src/lib/dates.ts`.

**Organização**
- Código por módulo em `src/features/<modulo>/` (`schema.ts` Zod, `actions.ts` Server Actions, `queries.ts`, `components/`, testes ao lado `*.test.ts`).
- `src/server/` é só servidor (env, db, auth, fila). Nunca importar de componente client.
- Nomes de domínio em português, como no schema (`obra`, `lancamento`, `empresa_id`); infraestrutura em inglês.
- Componentes de UI: shadcn/ui (`src/components/ui`, gerado pelo CLI; `cn` vem do pacote `cn`, do próprio shadcn).

**Multi-tenant (implementado na Fase 2)**
- Consulta de domínio **só** por `withScope(ctx, (tx) => ...)` (`src/server/db/scope.ts`): abre transação, faz `SET LOCAL ROLE rgo_app` e injeta o escopo (`app.*`) lido pelas políticas de RLS. Lint proíbe importar `@/server/db/client` em `app/`, `components/` e `features/` (exceto `auth` e `integracoes`).
- Mesmo com RLS, filtre por empresa/obra na consulta: o RLS é a rede de segurança, não a regra de negócio. Nunca confie em `empresa_id` vindo do client.
- **Toda tabela de domínio nova**: `empresa_id` (+ `obra_id` quando houver), FK composta `(obra_id, empresa_id)` → `obra(id, empresa_id)`, e uma migration custom chamando `SELECT rgo_enable_rls(tabela, obra|empresa|admin)` (modos em `drizzle/0002_rls_tenant.sql`). Isso também concede DML ao `rgo_app`. Tabelas de auth (`user`, `account`, `session`...) nunca recebem GRANT ao `rgo_app`.
- **Views materializadas e SQL cru ignoram RLS**: ao agregar (dashboards), filtrar explicitamente por empresa/obra do contexto e ter teste de isolamento.
- Perfis e permissões: `src/features/auth/policies.ts` (`can`, `canAccessEmpresa`, `canAccessObra`). Contexto do usuário: `requireContext()` / `requireAdmin()` (`features/auth/session.ts`). Sem sessão válida → /login; não-admin em área de admin → 404.
- O `proxy.ts` só redireciona pelo cookie; **a barreira real é validar a sessão** em cada página, Server Action e Route Handler.
- Sem cadastro público (`disableSignUp`). Usuários são criados pelo Administrador; o primeiro via `pnpm admin:create`.
- Credenciais de ERP: AES-256-GCM, nunca no front nem nos logs.
- Formulários que enviam credenciais usam `method="post"` e ficam desabilitados até a hidratação (`useHydrated`), para nunca vazar senha na URL.

**Padrão de um CRUD (Fase 3)**
- Pasta `src/features/<modulo>/`: `schema.ts` (Zod, usado no formulário **e** no servidor), `service.ts` (regras + `withScope` + auditoria **na mesma transação**; recebe `ctx`, sem `next/headers`, testável), `actions.ts` (`"use server"`, só `adminAction(schema, input, (ctx, data) => service...)`), `components/` (client: `FormDialog` + React Hook Form).
- Server Actions **nunca lançam**: devolvem `ActionResult` (`{ok, data}` | `{ok:false, error, fieldErrors}`). Regras de negócio lançam `ActionError` (mensagem pronta); erros do Postgres viram texto via `friendlyDbError`; o resto vira mensagem genérica + log.
- Toda escrita chama `registrarAuditoria(tx, ctx, ...)` (campos sensíveis são omitidos). Auditoria é append-only.
- Edição/exclusão de lançamento e orçamento só para `origem = manual`; os de planilha/ERP são mantidos pela importação/sincronização.
- Listas grandes: paginação no servidor com filtros na URL (GET, validados por Zod, valores inválidos descartados). Listas pequenas: `DataTable` (TanStack Table v8) no navegador.
- Dados de demonstração: `scripts/seed-data.ts` (puro e determinístico, testado) + `scripts/seed.ts`.

**Importação de planilhas (Fase 4)**
- `src/features/importacoes/`: `modelo.ts` é a ÚNICA fonte das colunas (gera o modelo .xlsx/.csv, o leitor e as instruções). Pipeline: `ler-arquivo.ts` (xlsx via SheetJS 0.20 do CDN oficial — o pacote `xlsx` do npm está abandonado e vulnerável; exige assinatura ZIP; csv próprio em `csv.ts`) → `linhas.ts` (Zod por linha) → `montar-previa.ts` (puro: resolve obra/categoria/etapa e calcula a chave de idempotência) → `service.ts` (prévia guardada em `importacao.payload`; confirmação em UMA transação com `INSERT ... ON CONFLICT DO UPDATE ... WHERE ... IS DISTINCT FROM`, que devolve inseridos/atualizados/sem mudança).
- Nada vai para as tabelas de negócio antes de confirmar. A confirmação "reserva" a importação (`status previa → processando`) para impedir confirmação dupla.
- Chave de idempotência: `x:<id_externo>` ou `h:<hash do conteúdo>#<ocorrência>`. Orçamento deixa o valor FORA da chave (reimportar com valor novo atualiza); importar versão maior aposenta (`vigente=false`) a anterior.
- Dentro de uma transação (`withScope`), consultas são **sequenciais**: `Promise.all` na mesma `tx` compartilha a conexão (o `pg` 9 vai proibir).
- Upload é um Route Handler (`/api/importacoes`), não Server Action (limite de 1 MB do corpo).

**Integrações com ERP (Fase 5)**
- `src/features/integracoes/`: `erp/tipos.ts` define o contrato `ErpAdapter` (o resto do sistema só conhece ele); `erp/registro.ts` escolhe o adaptador (Sienge funcional, UAU esqueleto com `validarEndereco`, Lumia stub). Sienge: `sienge/client.ts` (Basic auth, limitadores REST 200/min e BULK 20/min compartilhados por subdomínio, retry com backoff/jitter, `Retry-After`, 429 pausa o limitador, URL anti-SSRF), `sienge/schemas.ts` (Zod do que o ERP devolve), `sienge/mappers.ts` (puro: rateio por percentual com maior resto, pago→realizado, saldo→a realizar, `forecastDocument`→previsão, orçamento por etapa×grupo, avanço ponderado).
- `sync.ts` orquestra uma execução (`sincronizacao` com contadores e log): lê pelo adaptador, grava com os MESMOS upserts da importação (`lancamentos|orcamento|avanco/upsert.ts`, idempotentes por `(empresa, origem, integração, id_origem)`) e varre o que sumiu do ERP, com trava contra exclusão em massa. Falhas do ERP ficam na linha de execução; só erro de infraestrutura vira exceção (o pg-boss marca o job).
- Fila `erp-sync` (pg-boss, política `stately`: no máximo 1 na fila + 1 ativa por integração; rajada de eventos vira uma sincronização). `worker/index.ts` consome e roda `reconciliarAgendamentos` ao subir (cron em UTC). A tela só enfileira (`solicitarSincronizacao`); **sem worker nada executa**.
- Credenciais: `crypto.ts` (AES-256-GCM, AAD `integracao:<id>`, versão de chave no valor). `ENCRYPTION_KEY` não pode ser perdida nem trocada. Credencial reenviada igual à atual não conta como alteração. Mudou endereço/credenciais → integração volta a `pausada` até novo teste.
- Webhook (`/api/webhooks/[erp]/[integracaoId]`): `Authorization: Bearer` comparado por hash em tempo constante; 401 idêntico para id inexistente, ERP errado e segredo errado; corpo nunca é confiado, só dispara sincronização incremental.
- Testes: unitários com o Sienge falso (`src/test/fake-sienge.ts`, servidor HTTP com os formatos dos OpenAPI); integração com Postgres e pg-boss reais (`sync`, `service`, `fila`); e2e contra o Sienge falso (o Playwright liga `ERP_ALLOW_CUSTOM_BASE_URL=true` só para o servidor dele). Nunca testar contra o Sienge real.

**Dashboards (Fase 6)**
- `src/features/dashboards/`: `filtros.ts` (Zod da URL; valor inválido é descartado; padrão = 12 meses até o mês de hoje, máximo 60), `periodo.ts` (meses/datas como texto, "hoje" em Brasília), `calculos.ts` e `faixas.ts` (puros e testados: razões em bps, top+"Demais", faixas de vencimento), `queries.ts` (`carregarDashboard`: tudo numa só transação `withScope`, consultas sequenciais).
- Definições (também em `calculos.ts`): só `classe = operacional` entra em custo/receita/margem; incorrido = custo pago; comprometido = pago + a pagar; orçado = orçamento `vigente`; desvio = comprometido − orçado. Período (`de`–`ate`, por competência) vale para KPIs, evolução e distribuições; orçado × comprometido, grupos e avanço são acumulados até o fim de `ate`; vencimentos ignoram o período. Isso é dito na tela: manter coerente ao mudar.
- Isolamento: além do RLS, toda consulta repete `visivelPorObra`/`visivelObra` e aplica empresa/obra da URL (que o usuário não enxerga = nenhuma linha). `queries.int.test.ts` confere números calculados à mão e o isolamento de cada perfil. Agregações novas precisam do mesmo teste.
- Gráficos: shadcn `chart` (Recharts 3) com paleta própria `--chart-1..7` em `globals.css` (claro e escuro). Componentes de gráfico são client e recebem dados prontos da página (server); filtros por GET. Valores em centavos até a borda (`formatBRL`, `formatBRLCompact`). TanStack Query não é usado aqui: a página é server-rendered e os filtros recarregam por URL.
- `compararAvanco` usa como linha de base a MENOR versão planejada (planilha = 0, Sienge = 1).

**Exportação (Fase 7)**
- `src/features/exportacoes/`: o arquivo é gerado no Route Handler (`/api/exportacoes/painel` e `/api/exportacoes/lancamentos`) com os mesmos filtros da tela. Excel (ExcelJS) é a planilha de trabalho; PDF (React-PDF, Helvetica/WinAnsi — sem "−", "→", "≥") é o relatório para ler. Lançamentos: até 50.000 linhas no Excel e 2.000 no PDF.
- Qualquer perfil que pode ver o relatório pode exportar (`exportar` + `relatorio`). A auditoria (`acao = exportar`) é gravada DEPOIS de gerar o arquivo e ANTES de entregá-lo; Empresa/Cliente só registram em nome de empresa de que são membros (migration `0007`).

**Validação e erros**
- Toda entrada externa (formulário, planilha, webhook, ERP) passa por Zod antes de tocar o banco.
- Variáveis de ambiente só via `getEnv()` (`src/server/env.ts`); novas variáveis entram no schema Zod **e** no `.env.example`.

**Banco**
- Migrations por `drizzle-kit`; nunca editar uma migration já aplicada. Schema em `src/server/db/schema/`.
- Idempotência de importação/sincronização: índice único `(empresa_id, origem, integracao_id, id_origem)` + upsert.

**Testes**
- Unitários com Vitest (`*.test.ts` ao lado do código). E2E com Playwright em `e2e/`.
- Testes de isolamento entre empresas rodam contra Postgres real, não mock (`*.int.test.ts`, projeto `integration` do Vitest; usam ids com prefixo aleatório e limpam só o que criaram).

## Ambiente (Windows)

- O pnpm foi instalado por `npm i -g pnpm` (o `corepack enable` exige administrador).
- pnpm 10+ bloqueia scripts de build: dependências que precisam deles entram em `allowBuilds` no `pnpm-workspace.yaml`.
- Projeto dentro do OneDrive: excluir `node_modules` e `.next` da sincronização, ou mover o projeto para fora.
