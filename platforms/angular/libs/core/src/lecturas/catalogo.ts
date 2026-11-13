import { esRegistro, leerNumero, leerTexto } from '../http/borde';
import { lista, presente, registro } from './comun';

/**
 * Las formas neutras de las lecturas genéricas `api/lecturas/{vertical}` y sus lectores (014-despiece-tienda e
 * 012-blogs-social, I4). La forma es la misma para todo vertical: un producto, un profesional y una publicación son un
 * {@link ElementoDelCatalogo}; lo del vertical son sus `atributos` y cómo los pinta.
 *
 * Los lectores son defensivos, como los del borde: toleran una forma parcial, y descartan una entrada sin `id`. Lo que
 * cada vertical exige además (un título, un asunto) lo exige su adaptador.
 */

/** Un importe con su moneda y como se lee en el sitio. */
export interface PrecioNeutro {
  readonly monto: number;
  readonly moneda: string;
  readonly texto: string;
}

/** El promedio de las calificaciones y cuántas lo forman. */
export interface CalificacionNeutra {
  readonly promedio: number;
  readonly cantidad: number;
}

/** Un elemento del catálogo de cualquier vertical. Lo que falta no viaja: `undefined`, no un cero. */
export interface ElementoDelCatalogo {
  readonly id: string;
  readonly titulo: string;
  readonly imagen?: string;
  readonly precio?: PrecioNeutro;
  readonly precioAntes?: PrecioNeutro;
  readonly calificacion?: CalificacionNeutra;
  readonly disponibles?: number;
  /** Lo que el vertical quiere mostrar, por su clave (la tienda: `marca`; Blogs: `cuerpo`, `alias`…). */
  readonly atributos: Readonly<Record<string, string>>;
}

/** Un valor de una faceta, con cuántos elementos lo tienen. */
export interface ValorDeLaFaceta {
  readonly valor: string;
  readonly etiqueta: string;
  readonly cantidad: number;
}

/** Una faceta del listado: su campo (el de `?filtro.{campo}=`), su título, su tipo y sus valores. */
export interface FacetaDelListado {
  readonly campo: string;
  readonly titulo: string;
  readonly tipo: string;
  readonly valores: readonly ValorDeLaFaceta[];
}

/** Una página del listado. `total` es 0 si el servidor no lo dijo. */
export interface ListadoDelCatalogo {
  readonly elementos: readonly ElementoDelCatalogo[];
  readonly facetas: readonly FacetaDelListado[];
  readonly total: number;
}

function leerPrecio(value: unknown): PrecioNeutro | undefined {
  if (!esRegistro(value)) {
    return undefined;
  }
  return {
    monto: leerNumero(value['monto']),
    moneda: leerTexto(value['moneda']).trim(),
    texto: leerTexto(value['texto']).trim(),
  };
}

function leerCalificacion(value: unknown): CalificacionNeutra | undefined {
  if (!esRegistro(value)) {
    return undefined;
  }
  return { promedio: leerNumero(value['promedio']), cantidad: leerNumero(value['cantidad']) };
}

function leerAtributos(value: unknown): Readonly<Record<string, string>> {
  const atributos: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(registro(value))) {
    atributos[clave] = leerTexto(valor);
  }
  return atributos;
}

/**
 * Un elemento del catálogo, o `null` si no lo es. `idPorDefecto` es el de quien lo trae (lo guardado en una
 * colección), por si el elemento no repite el suyo.
 */
export function leerElementoDelCatalogo(value: unknown, idPorDefecto = ''): ElementoDelCatalogo | null {
  if (!esRegistro(value)) {
    return null;
  }
  const id = leerTexto(value['id']).trim() || idPorDefecto;
  if (!id) {
    return null;
  }
  const imagen = leerTexto(value['imagen']).trim();
  const disponibles = value['disponibles'];
  return {
    id,
    titulo: leerTexto(value['titulo']).trim(),
    imagen: imagen || undefined,
    precio: leerPrecio(value['precio']),
    precioAntes: leerPrecio(value['precioAntes']),
    calificacion: leerCalificacion(value['calificacion']),
    disponibles: typeof disponibles === 'number' ? disponibles : undefined,
    atributos: leerAtributos(value['atributos']),
  };
}

function leerValorDeLaFaceta(value: unknown): ValorDeLaFaceta | null {
  if (!esRegistro(value)) {
    return null;
  }
  const valor = leerTexto(value['valor']).trim();
  if (!valor) {
    return null;
  }
  return {
    valor,
    etiqueta: leerTexto(value['etiqueta']).trim() || valor,
    cantidad: Math.trunc(leerNumero(value['cantidad'])),
  };
}

/** Las facetas de un listado; las que no tienen campo no lo son. */
export function leerFacetasDelListado(value: unknown): readonly FacetaDelListado[] {
  return lista(value)
    .map((entrada): FacetaDelListado | null => {
      if (!esRegistro(entrada)) {
        return null;
      }
      const campo = leerTexto(entrada['campo']).trim();
      if (!campo) {
        return null;
      }
      return {
        campo,
        titulo: leerTexto(entrada['titulo']).trim() || campo,
        tipo: leerTexto(entrada['tipo']).trim() || 'MultiSelect',
        valores: lista(entrada['valores']).map(leerValorDeLaFaceta).filter(presente),
      };
    })
    .filter(presente);
}

/** Una página del listado del catálogo, o `null` si la respuesta no lo es (no trae `elementos`). */
export function leerListadoDelCatalogo(value: unknown): ListadoDelCatalogo | null {
  if (!esRegistro(value) || !Array.isArray(value['elementos'])) {
    return null;
  }
  return {
    elementos: value['elementos'].map((entrada) => leerElementoDelCatalogo(entrada)).filter(presente),
    facetas: leerFacetasDelListado(value['facetas']),
    total: leerNumero(value['total']),
  };
}
