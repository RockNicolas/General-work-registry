# RGO — Registro Geral de Obra

Sistema web que une financeiro e custos de obras, com dashboards e gráficos para a diretoria.
Dados vêm de ERPs (Sienge, UAU) e de planilhas em modelo padrão.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · PostgreSQL + Drizzle · Tailwind 4 + shadcn/ui · pg-boss · Vitest + Playwright.

## Requisitos

- Node.js 22+
- pnpm (`npm install -g pnpm`)
- Um Postgres 17+ em **UTF8**: o projeto usa o [Neon](https://neon.tech) (branch `develop` para dev e testes).
  Docker é opcional (ver abaixo).

## Rodando localmente

```bash
pnpm install
cp .env.example .env          # preencha DATABASE_URL com a conexão DIRETA do branch develop do Neon
pnpm db:migrate               # aplica as migrations
pnpm dev                      # http://localhost:3000
```

No Neon, copie a connection string com **"Pooled connection" desligado** (host sem `-pooler`).
O pg-boss e as migrations não funcionam pelo pooler.

### Primeiro acesso: criar o administrador

Não há cadastro público. Crie o primeiro administrador pelo terminal:

```bash
pnpm admin:create --email voce@empresa.com --nome "Seu Nome" --senha "UmaSenhaForte123"
```

Depois entre em `http://localhost:3000/login`. Daí em diante o administrador cria empresas e usuários pela interface.
Perfis: **Administrador** (tudo), **Empresa** (leitura das próprias obras) e **Cliente** (leitura das obras liberadas).

### Dados de demonstração (opcional)

```bash
pnpm db:seed             # 3 empresas, 8 obras, ~1.400 lançamentos, orçamento e avanço físico
pnpm db:seed --limpar    # remove os dados de demonstração
```

Logins (senha de todos: `Demo@12345`): `admin@rgo.demo` (administrador), `aurora@rgo.demo` e
`horizonte@rgo.demo` (empresa) e `cliente@rgo.demo` (só 3 obras liberadas).
O seed **recusa rodar em banco que tenha empresas reais** — use só no `develop`.

Conferência: abra `http://localhost:3000/api/health` — deve responder `{"status":"ok","db":"up"}`.
A primeira chamada depois de um tempo parado pode demorar alguns segundos (o Neon acorda).

### Postgres local com Docker (opcional)

```bash
docker compose up -d db       # Postgres 17 em localhost:5432
# DATABASE_URL=postgres://rgo:rgo@localhost:5432/rgo
```

Se a porta 5432 estiver ocupada: `DB_PORT=5433 docker compose up -d db` e use `localhost:5433` na URL.

### Worker (sincronização com ERPs)

O pg-boss roda num processo separado do Next:

```bash
pnpm worker
```

### Tudo em contêineres (opcional)

```bash
docker compose --profile app up --build
```

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm check` | lint + typecheck + todos os testes (unitários e de integração) |
| `pnpm lint` / `typecheck` / `test` | etapas isoladas |
| `pnpm test:unit` / `test:int` | só unitários (sem banco) / só integração (precisa do banco) |
| `pnpm admin:create` | cria ou promove um administrador |
| `pnpm db:seed` | dados de demonstração (`--limpar` remove) |
| `pnpm test:e2e` | Playwright (usa o banco do `.env`) |
| `pnpm db:generate` / `db:migrate` / `db:studio` | Drizzle Kit (o `db:migrate` é um executor próprio que mostra o erro real) |
| `pnpm worker` | worker pg-boss |

Os testes de integração e o e2e usam o banco do `.env` (branch `develop`): rodam as migrations e criam dados de teste com ids próprios.
Na primeira execução do e2e: `pnpm exec playwright install chromium`.

## Estrutura

```
src/app/           rotas (App Router) e route handlers
src/features/      módulos de negócio (empresas, obras, usuários, etapas, orçamento, lançamentos, ...)
src/server/        env, banco (Drizzle), auth e fila — só servidor
src/components/    ui/ (shadcn) e layout/
src/lib/           utilitários puros (moeda, datas pt-BR)
worker/            processo pg-boss
drizzle/           migrations
e2e/               testes Playwright
```

Convenções do projeto em [CLAUDE.md](CLAUDE.md).

## Windows + OneDrive

Se o projeto estiver numa pasta sincronizada pelo OneDrive, exclua `node_modules` e `.next` da sincronização
(ou mova o projeto para fora do OneDrive): são milhares de arquivos que o OneDrive tenta enviar.
