import { esRegistro, leerTexto } from '../http/borde';

/**
 * Un filtro fijo del catálogo, como lo declara el bloque en el CMS: el campo de una faceta del listado genérico y el
 * valor que se fija. La página «Ofertas» de la tienda es el catálogo con `oferta = En oferta` (014-despiece-tienda,
 * I5), y la de una etiqueta de Blogs es Explorar con `etiqueta = arquitectura` (012-blogs-social, I6). El elemento no
 * sabe qué es una oferta ni una etiqueta: aplica el filtro en cada búsqueda y no lo ofrece como faceta.
 *
 * Vivió en `libs/dominio/tienda` hasta que lo usó la segunda vertical (I6, paso 3 de la receta de 014).
 */
export interface FiltroFijoDelCatalogo {
  readonly campo: string;
  readonly valor: string;
}

/** Los filtros fijos que llegan en el `config`, saneados: con campo y valor, y sin repetir. */
export function leerFiltrosFijos(value: unknown): readonly FiltroFijoDelCatalogo[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const vistos = new Set<string>();
  const filtros: FiltroFijoDelCatalogo[] = [];
  for (const entrada of value) {
    if (!esRegistro(entrada)) {
      continue;
    }
    const campo = leerTexto(entrada['campo']).trim();
    const valor = leerTexto(entrada['valor']).trim();
    const clave = `${campo}=${valor}`;
    if (!campo || !valor || vistos.has(clave)) {
      continue;
    }
    vistos.add(clave);
    filtros.push({ campo, valor });
  }
  return filtros;
}

/** Los filtros fijos como facetas del criterio de búsqueda: los valores de un mismo campo, juntos. */
export function facetasFijas(
  filtros: readonly FiltroFijoDelCatalogo[],
): Readonly<Record<string, readonly string[]>> {
  const facetas: Record<string, string[]> = {};
  for (const { campo, valor } of filtros) {
    (facetas[campo] ??= []).push(valor);
  }
  return facetas;
}
