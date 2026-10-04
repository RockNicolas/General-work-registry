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
- Trabalho em fases; ao fim de cada uma: `pnpm check` (+ e2e quando houver UI), resumo e **parar para aprovação**.

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
