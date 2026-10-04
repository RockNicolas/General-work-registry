CREATE TYPE "public"."avanco_tipo" AS ENUM('planejado', 'realizado');--> statement-breakpoint
CREATE TYPE "public"."categoria_grupo" AS ENUM('material', 'maquinas_equipamentos', 'mao_obra_direta', 'mao_obra_indireta', 'servicos', 'outros', 'receita');--> statement-breakpoint
CREATE TYPE "public"."erp" AS ENUM('sienge', 'uau', 'lumia');--> statement-breakpoint
CREATE TYPE "public"."importacao_status" AS ENUM('previa', 'processando', 'concluida', 'concluida_com_erros', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."integracao_status" AS ENUM('ativa', 'erro', 'pausada');--> statement-breakpoint
CREATE TYPE "public"."lancamento_classe" AS ENUM('operacional', 'aporte', 'adiantamento', 'devolucao_socio');--> statement-breakpoint
CREATE TYPE "public"."lancamento_situacao" AS ENUM('realizado', 'a_realizar');--> statement-breakpoint
CREATE TYPE "public"."lancamento_tipo" AS ENUM('custo', 'receita');--> statement-breakpoint
CREATE TYPE "public"."origem" AS ENUM('erp', 'planilha', 'manual');--> statement-breakpoint
CREATE TYPE "public"."sync_gatilho" AS ENUM('manual', 'agendada', 'webhook', 'carga_historica');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('enfileirada', 'executando', 'concluida', 'concluida_com_erros', 'falhou');--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" text,
	"usuario_id" text,
	"usuario_nome" text,
	"acao" text NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" text,
	"resumo" text,
	"antes" jsonb,
	"depois" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "importacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" text NOT NULL,
	"usuario_id" text,
	"arquivo_nome" text NOT NULL,
	"arquivo_hash" text NOT NULL,
	"status" "importacao_status" DEFAULT 'previa' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"ok" integer DEFAULT 0 NOT NULL,
	"com_erro" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "importacao_id_empresa_uq" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "importacao_erro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" text NOT NULL,
	"importacao_id" uuid NOT NULL,
	"aba" text,
	"linha" integer NOT NULL,
	"coluna" text,
	"valor" text,
	"mensagem" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avanco_fisico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" text NOT NULL,
	"obra_id" uuid NOT NULL,
	"competencia" date NOT NULL,
	"tipo" "avanco_tipo" NOT NULL,
	"versao" smallint DEFAULT 0 NOT NULL,
	"pct_mes_bps" integer DEFAULT 0 NOT NULL,
	"pct_acum_bps" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avanco_pct_mes_faixa" CHECK ("avanco_fisico"."pct_mes_bps" between 0 and 10000),
	CONSTRAINT "avanco_pct_acum_faixa" CHECK ("avanco_fisico"."pct_acum_bps" between 0 and 10000),
	CONSTRAINT "avanco_competencia_dia_1" CHECK (extract(day from "avanco_fisico"."competencia") = 1)
);
--> statement-breakpoint
CREATE TABLE "categoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" text NOT NULL,
	"nome" text NOT NULL,
	"grupo" "categoria_grupo" DEFAULT 'outros' NOT NULL,
	"codigo_origem" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categoria_id_empresa_uq" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "etapa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" text NOT NULL,
	"obra_id" uuid NOT NULL,
	"pai_id" uuid,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "etapa_id_obra_uq" UNIQUE("id","obra_id")
);
--> statement-breakpoint
CREATE TABLE "orcamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" text NOT NULL,
	"obra_id" uuid NOT NULL,
	"etapa_id" uuid,
	"categoria_id" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"descricao" text,
	"valor_previsto_centavos" bigint NOT NULL,
	"origem" "origem" DEFAULT 'manual' NOT NULL,
	"id_origem" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orcamento_valor_nao_negativo" CHECK ("orcamento"."valor_previsto_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "integracao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" text NOT NULL,
	"erp" "erp" NOT NULL,
	"nome" text NOT NULL,
	"endereco" text NOT NULL,
	"credenciais_enc" text,
	"chave_versao" smallint DEFAULT 1 NOT NULL,
	"webhook_secret_hash" text,
	"status" "integracao_status" DEFAULT 'pausada' NOT NULL,
	"ultima_sync_em" timestamp with time zone,
	"ultimo_erro" text,
	"agendamento_cron" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integracao_id_empresa_uq" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "integracao_obra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" text NOT NULL,
	"integracao_id" uuid NOT NULL,
	"obra_id" uuid NOT NULL,
	"id_origem" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sincronizacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" text NOT NULL,
	"integracao_id" uuid NOT NULL,
	"gatilho" "sync_gatilho" NOT NULL,
	"status" "sync_status" DEFAULT 'enfileirada' NOT NULL,
	"escopo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"iniciada_em" timestamp with time zone,
	"finalizada_em" timestamp with time zone,
	"lidos" integer DEFAULT 0 NOT NULL,
	"gravados" integer DEFAULT 0 NOT NULL,
	"ignorados" integer DEFAULT 0 NOT NULL,
	"erros" integer DEFAULT 0 NOT NULL,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lancamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" text NOT NULL,
	"obra_id" uuid NOT NULL,
	"etapa_id" uuid,
	"categoria_id" uuid NOT NULL,
	"tipo" "lancamento_tipo" NOT NULL,
	"situacao" "lancamento_situacao" DEFAULT 'realizado' NOT NULL,
	"classe" "lancamento_classe" DEFAULT 'operacional' NOT NULL,
	"is_previsao" boolean DEFAULT false NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"data_competencia" date NOT NULL,
	"data_vencimento" date,
	"data_liquidacao" date,
	"contraparte" text,
	"documento" text,
	"descricao" text,
	"origem" "origem" DEFAULT 'manual' NOT NULL,
	"integracao_id" uuid,
	"importacao_id" uuid,
	"id_origem" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lancamento_valor_nao_zero" CHECK ("lancamento"."valor_centavos" <> 0)
);
--> statement-breakpoint
ALTER TABLE "importacao" ADD CONSTRAINT "importacao_empresa_id_organization_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao" ADD CONSTRAINT "importacao_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao_erro" ADD CONSTRAINT "importacao_erro_importacao_fk" FOREIGN KEY ("importacao_id","empresa_id") REFERENCES "public"."importacao"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avanco_fisico" ADD CONSTRAINT "avanco_obra_empresa_fk" FOREIGN KEY ("obra_id","empresa_id") REFERENCES "public"."obra"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categoria" ADD CONSTRAINT "categoria_empresa_id_organization_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etapa" ADD CONSTRAINT "etapa_obra_empresa_fk" FOREIGN KEY ("obra_id","empresa_id") REFERENCES "public"."obra"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etapa" ADD CONSTRAINT "etapa_pai_fk" FOREIGN KEY ("pai_id","obra_id") REFERENCES "public"."etapa"("id","obra_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento" ADD CONSTRAINT "orcamento_obra_empresa_fk" FOREIGN KEY ("obra_id","empresa_id") REFERENCES "public"."obra"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento" ADD CONSTRAINT "orcamento_etapa_fk" FOREIGN KEY ("etapa_id","obra_id") REFERENCES "public"."etapa"("id","obra_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento" ADD CONSTRAINT "orcamento_categoria_fk" FOREIGN KEY ("categoria_id","empresa_id") REFERENCES "public"."categoria"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracao" ADD CONSTRAINT "integracao_empresa_id_organization_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracao_obra" ADD CONSTRAINT "integracao_obra_integracao_fk" FOREIGN KEY ("integracao_id","empresa_id") REFERENCES "public"."integracao"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracao_obra" ADD CONSTRAINT "integracao_obra_obra_fk" FOREIGN KEY ("obra_id","empresa_id") REFERENCES "public"."obra"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sincronizacao" ADD CONSTRAINT "sincronizacao_integracao_fk" FOREIGN KEY ("integracao_id","empresa_id") REFERENCES "public"."integracao"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_obra_empresa_fk" FOREIGN KEY ("obra_id","empresa_id") REFERENCES "public"."obra"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_etapa_fk" FOREIGN KEY ("etapa_id","obra_id") REFERENCES "public"."etapa"("id","obra_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_categoria_fk" FOREIGN KEY ("categoria_id","empresa_id") REFERENCES "public"."categoria"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_integracao_fk" FOREIGN KEY ("integracao_id","empresa_id") REFERENCES "public"."integracao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_importacao_fk" FOREIGN KEY ("importacao_id","empresa_id") REFERENCES "public"."importacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_criado_idx" ON "auditoria" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "auditoria_entidade_idx" ON "auditoria" USING btree ("entidade","entidade_id");--> statement-breakpoint
CREATE INDEX "auditoria_empresa_idx" ON "auditoria" USING btree ("empresa_id","criado_em");--> statement-breakpoint
CREATE INDEX "importacao_empresa_idx" ON "importacao" USING btree ("empresa_id","created_at");--> statement-breakpoint
CREATE INDEX "importacao_erro_importacao_idx" ON "importacao_erro" USING btree ("importacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "avanco_unico_uidx" ON "avanco_fisico" USING btree ("obra_id","tipo","versao","competencia");--> statement-breakpoint
CREATE UNIQUE INDEX "categoria_empresa_nome_uidx" ON "categoria" USING btree ("empresa_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "etapa_obra_codigo_uidx" ON "etapa" USING btree ("obra_id","codigo");--> statement-breakpoint
CREATE INDEX "etapa_obra_idx" ON "etapa" USING btree ("obra_id");--> statement-breakpoint
CREATE INDEX "orcamento_obra_idx" ON "orcamento" USING btree ("obra_id","vigente");--> statement-breakpoint
CREATE UNIQUE INDEX "orcamento_origem_uidx" ON "orcamento" USING btree ("empresa_id","origem","id_origem") WHERE "orcamento"."id_origem" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "integracao_empresa_nome_uidx" ON "integracao" USING btree ("empresa_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "integracao_obra_origem_uidx" ON "integracao_obra" USING btree ("integracao_id","id_origem");--> statement-breakpoint
CREATE UNIQUE INDEX "integracao_obra_obra_uidx" ON "integracao_obra" USING btree ("integracao_id","obra_id");--> statement-breakpoint
CREATE INDEX "sincronizacao_integracao_idx" ON "sincronizacao" USING btree ("integracao_id","created_at");--> statement-breakpoint
CREATE INDEX "lancamento_obra_data_idx" ON "lancamento" USING btree ("empresa_id","obra_id","data_competencia");--> statement-breakpoint
CREATE INDEX "lancamento_obra_situacao_venc_idx" ON "lancamento" USING btree ("obra_id","situacao","data_vencimento");--> statement-breakpoint
CREATE INDEX "lancamento_importacao_idx" ON "lancamento" USING btree ("importacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lancamento_origem_uidx" ON "lancamento" USING btree ("empresa_id","origem",coalesce("integracao_id", '00000000-0000-0000-0000-000000000000'::uuid),"id_origem") WHERE "lancamento"."id_origem" is not null;