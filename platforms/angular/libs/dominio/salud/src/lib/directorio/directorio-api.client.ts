import { esRegistro, leerJsonDelBorde, leerTexto } from '@synergos/core';
import type { AgendaDeclarada, Profesional } from './directorio.model';

/** Cuántos profesionales se piden de una vez: el directorio de un consultorio cabe entero en una página. */
const POR_PAGINA = 100;

/**
 * El directorio de Salud desde la lectura genérica del catálogo (`GET {lecturasBase}/catalogo`, 003-salud-cita, I1 de
 * producción). Si el borde no contesta o contesta otra forma, **lanza**: un directorio inventado manda a agendar con
 * quien no existe, y el que llama decide qué decir.
 */
export async function leerDirectorio(lecturasBase: string): Promise<readonly Profesional[]> {
  const datos = await leerJsonDelBorde(lecturasBase, `${lecturasBase}/catalogo?porPagina=${POR_PAGINA}`);
  const profesionales = profesionalesDelListado(datos);
  if (!profesionales) {
    throw new Error('directorio-shape');
  }
  return profesionales;
}

/** Los profesionales de un listado del catálogo, o `null` si no tiene la forma del listado. */
export function profesionalesDelListado(valor: unknown): readonly Profesional[] | null {
  if (!esRegistro(valor) || !Array.isArray(valor['elementos'])) {
    return null;
  }
  return valor['elementos'].map(profesional).filter((p): p is Profesional => p !== null);
}

function profesional(valor: unknown): Profesional | null {
  if (!esRegistro(valor)) {
    return null;
  }
  const id = leerTexto(valor['id']).trim();
  const nombre = leerTexto(valor['titulo']).trim();
  if (!id || !nombre) {
    return null;
  }
  const atributos = esRegistro(valor['atributos']) ? valor['atributos'] : {};
  const atributo = (clave: string): string => leerTexto(atributos[clave]).trim();
  const foto = leerTexto(valor['imagen']).trim();
  return {
    id,
    nombre,
    especialidad: atributo('especialidad'),
    registro: atributo('registro'),
    telefono: atributo('telefono'),
    correo: atributo('correo'),
    aceptaPacientes: siONo(atributo('aceptaPacientes')),
    foto: foto || null,
    agenda: agenda(atributo('dias'), atributo('desde'), atributo('hasta'), atributo('minutos')),
  };
}

function siONo(texto: string): boolean | null {
  return texto === 'si' ? true : texto === 'no' ? false : null;
}

function agenda(dias: string, desde: string, hasta: string, minutos: string): AgendaDeclarada | null {
  const entero = (texto: string): number | null => (/^\d+$/.test(texto) ? Number(texto) : null);
  const listaDeDias = dias
    .split(',')
    .map((d) => entero(d.trim()))
    .filter((d): d is number => d !== null && d <= 6);
  const [inicio, fin, duracion] = [entero(desde), entero(hasta), entero(minutos)];
  if (listaDeDias.length === 0 || inicio === null || fin === null || duracion === null || duracion === 0 || fin <= inicio) {
    return null;
  }
  return { dias: listaDeDias, desde: inicio, hasta: fin, minutos: duracion };
}
