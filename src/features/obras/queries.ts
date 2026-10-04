import "server-only";
import { cache } from "react";
import { buscarObra } from "./service";

/** Layout e página da obra consultam a mesma obra; o cache por requisição evita a segunda ida ao banco. */
export const obterObra = cache(buscarObra);
