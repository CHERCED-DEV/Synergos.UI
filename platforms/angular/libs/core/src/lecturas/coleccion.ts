import { esRegistro, leerTexto } from '../http/borde';
import { leerElementoDelCatalogo, type ElementoDelCatalogo } from './catalogo';
import { presente } from './comun';

/** La colección del miembro de las lecturas genéricas (`GET api/lecturas/{vertical}/colecciones/{coleccion}`). */

/** Algo guardado en una colección. `elemento` es `null` si el catálogo ya no lo tiene: estaba, no se inventa. */
export interface ElementoGuardado {
  readonly id: string;
  readonly guardado: string;
  readonly elemento: ElementoDelCatalogo | null;
}

/** Una colección del miembro (la lista de deseos, los guardados). */
export interface ColeccionDelMiembro {
  readonly coleccion: string;
  readonly elementos: readonly ElementoGuardado[];
}

/** Una colección del miembro, o `null` si la respuesta no lo es (no trae `elementos`). */
export function leerColeccionDelMiembro(value: unknown): ColeccionDelMiembro | null {
  if (!esRegistro(value) || !Array.isArray(value['elementos'])) {
    return null;
  }
  return {
    coleccion: leerTexto(value['coleccion']).trim(),
    elementos: value['elementos']
      .map((entrada): ElementoGuardado | null => {
        if (!esRegistro(entrada)) {
          return null;
        }
        const id = leerTexto(entrada['id']).trim();
        if (!id) {
          return null;
        }
        return {
          id,
          guardado: leerTexto(entrada['guardado']).trim(),
          elemento: leerElementoDelCatalogo(entrada['elemento'], id),
        };
      })
      .filter(presente),
  };
}
