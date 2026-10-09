import { CATEGORIA_GRUPO_LABEL } from "@/lib/domain";
import type { GrupoCusto } from "./queries";

/** Nome de um grupo de custo para telas e relatórios (inclui o balde "sem categoria" do orçamento). */
export const rotuloGrupo = (g: GrupoCusto): string => (g === "sem_categoria" ? "Sem categoria" : CATEGORIA_GRUPO_LABEL[g]);
