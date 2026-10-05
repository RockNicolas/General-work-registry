import type { Erp } from "@/lib/domain";
import type { ConfigIntegracao } from "../config";
import { LumiaAdapter } from "../lumia/adapter";
import type { Limitadores } from "../sienge/client";
import { SiengeAdapter } from "../sienge/adapter";
import { UauAdapter } from "../uau/adapter";
import type { OpcoesHttp } from "./http";
import type { ErpAdapter } from "./tipos";

export type IntegracaoParaAdapter = {
  erp: Erp;
  endereco: string;
  credenciais: { usuario: string; senha: string };
  config: ConfigIntegracao;
};

export type AmbienteAdapter = {
  /** Permite URL completa no lugar do subdomínio (somente dev/teste). */
  permitirCustom?: boolean;
  http?: OpcoesHttp;
  limitadores?: Limitadores;
  hoje?: () => string;
};

export type FabricaAdapter = (integracao: IntegracaoParaAdapter, ambiente?: AmbienteAdapter) => ErpAdapter;

/** Escolhe e configura o adaptador do ERP da integração. */
export const criarAdapter: FabricaAdapter = (i, ambiente = {}) => {
  switch (i.erp) {
    case "sienge":
      return new SiengeAdapter({
        endereco: i.endereco,
        usuario: i.credenciais.usuario,
        senha: i.credenciais.senha,
        indexadorCorrecaoId: i.config.indexadorCorrecaoId,
        mapeamento: { valorPagamento: i.config.valorPagamento },
        escalaPercentual: i.config.escalaPercentual,
        permitirCustom: ambiente.permitirCustom,
        http: ambiente.http,
        limitadores: ambiente.limitadores,
        hoje: ambiente.hoje,
      });
    case "uau":
      return new UauAdapter({ endereco: i.endereco, usuario: i.credenciais.usuario, senha: i.credenciais.senha });
    case "lumia":
      return new LumiaAdapter();
  }
};
