# RGO — Registro Geral de Obra

Sistema web que une financeiro e custos de obras, com dashboards e gráficos para a diretoria.
Dados vêm de ERPs (Sienge, UAU) e de planilhas em modelo padrão.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · PostgreSQL + Drizzle · Tailwind 4 + shadcn/ui · pg-boss · Vitest + Playwright.

## Requisitos

- Node.js 22+
- pnpm (`npm install -g pnpm`)
- Um Postgres 17+ em **UTF8**: o projeto usa o [Neon](https://neon.tech) (branch `develop` para dev e testes).

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

### Worker (sincronização com ERPs)

O pg-boss roda num processo separado do Next. **Sem ele, o botão "Sincronizar agora" só enfileira** (a execução fica "Na fila")
e os agendamentos não disparam:

```bash
pnpm worker          # lê o .env; em produção: pnpm worker:prod com as variáveis do serviço
```

Rode **um** worker por banco. Para o e2e (`pnpm test:e2e`) não precisa de worker, mas pare qualquer outro apontando para o mesmo banco.

## Importação de planilhas

Administrador: menu **Importações**. Baixe o modelo (`.xlsx` com instruções, listas suspensas e abas `Lancamentos`, `Orcamento` e `AvancoFisico`; ou `.csv` por conjunto), preencha e envie.
O sistema mostra uma **prévia** e os **erros por linha** (aba, linha, coluna, valor informado e motivo) e só grava quando você confirma.

- Aceita `.xlsx` e `.csv` (separador `;` ou `,`, UTF-8 ou Windows-1252). Até 10 MB e 20.000 linhas por conjunto.
- Código da obra, nome da categoria e código da etapa precisam existir (cadastre antes). A importação é por empresa.
- **Reimportar não duplica.** Com a coluna `id_externo`, reenviar uma linha a **atualiza**; sem ela, linhas idênticas são reconhecidas pelo conteúdo.
- Tudo é gravado numa única transação: se algo falhar, nada é alterado.

## Painel de indicadores

**Visão geral** (todos os perfis, somente leitura; cada um vê só as próprias obras): custo, receita e margem por obra, por empresa e consolidado.
Filtros por empresa, obra, grupo de custo e período ficam na URL (o link é compartilhável). Mostra:

- KPIs do período: receita e custo realizados (e a receber/a pagar), margem realizada e projetada, obras;
- receita × custo × margem mês a mês;
- por obra: **orçado × comprometido × incorrido**, desvio do orçamento e margens (clique no cabeçalho para ordenar = ranking);
- **% comprometido por grupo** (materiais, máquinas e equipamentos, MOD, MOI, serviços...);
- custo por categoria e por etapa; avanço físico planejado × realizado; contas a pagar/receber por **faixa de vencimento**
  (30/45/60/90/120 dias, com e sem título de previsão); e, à parte, aportes/adiantamentos/devoluções (fora da margem).

Regras: só lançamentos **operacionais** entram na margem; comprometido = pago + a pagar; o orçado é o orçamento **vigente**.
Resultado, evolução e distribuições usam o período (por competência); orçado × comprometido, grupos e avanço são **acumulados até o mês final**;
vencimentos olham a partir de hoje. A seção "Como os números são calculados" da própria tela repete isso.

No topo da visão geral, **Exportar** baixa Excel ou PDF com os mesmos filtros da tela (os números do arquivo são os da página).
Na lista de lançamentos de uma obra, os mesmos botões baixam essa lista filtrada: o Excel traz todas as colunas (até 50.000 linhas);
o PDF é o relatório para ler e imprimir (até 2.000 linhas — acima disso, refine os filtros ou use o Excel).
Cada exportação fica na auditoria (quem, quando, formato e filtros). Um perfil só exporta o que já enxerga.

## Integração com o Sienge

Administrador: menu **Integrações**. Cada integração liga **uma empresa** a **um ERP** (hoje só o Sienge sincroniza; UAU e Lumia
ficam cadastráveis, aguardando a documentação da API).

1. **Nova integração**: empresa, subdomínio do Sienge (`minhaempresa` de `minhaempresa.sienge.com.br`), usuário e senha da API
   (criptografados com `ENCRYPTION_KEY`; a senha nunca é exibida de volta) e o **código do indexador de correção** do Sienge.
2. **Testar conexão**: valida as credenciais e ativa a integração. Mudar endereço ou credenciais volta ao estado "Pausada".
3. **Vincular obras**: "Buscar obras no ERP" lista os empreendimentos; escolha a obra do RGO de cada um (ou crie as que faltam).
   Só obras vinculadas são sincronizadas.
4. **Sincronizar agora** (incremental: reprocessa os últimos meses configurados) ou **Carga histórica** (todo o período).
   A sincronização automática (a cada 6 h, diária, dias úteis) e o webhook são opcionais.

O que entra: custos (contas a pagar, pagos = realizado, saldo = a realizar), receitas (contas a receber), orçamento por etapa e
grupo, e avanço físico. Tudo passa pelo mesmo caminho das planilhas: **reexecutar não duplica** e o que sumiu do ERP é removido
(com trava contra exclusão em massa). Respeita os limites do Sienge (200 req/min REST, 20 req/min bulk) com repetição e espera.

**Antes de confiar nos números, valide com a sua conta Sienge** (o mapeamento segue a documentação oficial, mas ainda não foi
conferido com dados reais): se as parcelas pagas chegam com `payments` na consulta por data de competência; a escala dos percentuais
(0–100 ou 0–1) e se o valor da baixa é líquido ou bruto (ambos ajustáveis na integração); o significado de `forecastDocument` para
"título de previsão"; e os nomes dos eventos de webhook. Compare um mês fechado com o relatório do Sienge.

**Webhook (opcional):** a tela da integração mostra a URL e gera um segredo (exibido uma única vez; guardamos só o hash). O ERP deve
chamar `POST /api/webhooks/sienge/<id>` com `Authorization: Bearer <segredo>`. O corpo é ignorado: o aviso só dispara uma sincronização
incremental (no máximo uma por minuto por integração). A URL precisa ser pública: em desenvolvimento use um túnel.

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
