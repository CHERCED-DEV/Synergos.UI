import { enviarJsonAlBorde, esRegistro, leerBooleano, leerJsonDelBorde, leerNumero, leerTexto } from '@synergos/core';
import type {
  BandejaDelConsultorio,
  CuentaDelPaciente,
  HiloDelConsultorio,
  HiloDelPaciente,
  ItemDeLaBandeja,
  LineaDeLaCuenta,
  MensajeClinico,
  TotalDeLaCuenta,
} from './mensajes.model';

/** Los adaptadores de mensajes, bandeja y estado de cuenta (`/api/healthcare`, I7). Otra forma **lanza**. */

export async function leerMisMensajes(base: string): Promise<readonly HiloDelPaciente[]> {
  return lista(await leerJsonDelBorde(base, `${base}/me/mensajes`), hiloDelPaciente);
}

/** El paciente escribe a un profesional: devuelve el hilo con él, con el mensaje nuevo. */
export async function escribirAlProfesional(base: string, profesional: string, texto: string): Promise<HiloDelPaciente> {
  return conForma(hiloDelPaciente(await enviarJsonAlBorde(base, `${base}/me/mensajes`, { profesional, texto })));
}

export async function leerElHilo(base: string, hiloId: string): Promise<HiloDelConsultorio> {
  return conForma(hiloDelConsultorio(await leerJsonDelBorde(base, `${base}/mensajes/${encodeURIComponent(hiloId)}`)));
}

export async function responderElHilo(base: string, hiloId: string, texto: string): Promise<HiloDelConsultorio> {
  return conForma(hiloDelConsultorio(await enviarJsonAlBorde(base, `${base}/mensajes/${encodeURIComponent(hiloId)}`, { texto })));
}

export async function leerLaBandeja(base: string): Promise<BandejaDelConsultorio> {
  const valor = await leerJsonDelBorde(base, `${base}/bandeja`);
  if (!esRegistro(valor)) {
    throw new Error('mensajes-shape');
  }
  return { items: lista(valor['items'], item), sinPermiso: leerNumero(valor['sinPermiso']) };
}

export async function leerMiCuenta(base: string): Promise<CuentaDelPaciente> {
  const valor = await leerJsonDelBorde(base, `${base}/me/estado-de-cuenta`);
  if (!esRegistro(valor)) {
    throw new Error('mensajes-shape');
  }
  return { lineas: lista(valor['lineas'], linea), totales: lista(valor['totales'], total) };
}

function lista<T>(valor: unknown, leer: (v: unknown) => T | null): readonly T[] {
  if (!Array.isArray(valor)) {
    throw new Error('mensajes-shape');
  }
  return valor.map(leer).filter((x): x is T => x !== null);
}

function conForma<T>(valor: T | null): T {
  if (!valor) {
    throw new Error('mensajes-shape');
  }
  return valor;
}

function mensaje(valor: unknown): MensajeClinico | null {
  if (!esRegistro(valor) || !leerTexto(valor['id'])) {
    return null;
  }
  return { id: leerTexto(valor['id']), delPaciente: leerBooleano(valor['delPaciente']), texto: leerTexto(valor['texto']), fecha: leerTexto(valor['fecha']) };
}

function hiloDelPaciente(valor: unknown): HiloDelPaciente | null {
  if (!esRegistro(valor) || !leerTexto(valor['id'])) {
    return null;
  }
  return {
    id: leerTexto(valor['id']),
    profesionalId: leerTexto(valor['profesionalId']),
    profesional: leerTexto(valor['profesional']),
    esperando: leerBooleano(valor['esperando']),
    ultimo: leerTexto(valor['ultimo']),
    mensajes: lista(valor['mensajes'], mensaje),
  };
}

function hiloDelConsultorio(valor: unknown): HiloDelConsultorio | null {
  const hilo = hiloDelPaciente(valor);
  return hilo && esRegistro(valor)
    ? { ...hilo, pacienteKey: leerTexto(valor['pacienteKey']), paciente: leerTexto(valor['paciente']) }
    : null;
}

function item(valor: unknown): ItemDeLaBandeja | null {
  if (!esRegistro(valor) || !leerTexto(valor['id'])) {
    return null;
  }
  const tipo = leerTexto(valor['tipo']);
  if (tipo !== 'resultado' && tipo !== 'renovacion' && tipo !== 'mensaje') {
    return null;
  }
  return {
    tipo,
    id: leerTexto(valor['id']),
    pacienteKey: leerTexto(valor['pacienteKey']),
    paciente: leerTexto(valor['paciente']),
    resumen: leerTexto(valor['resumen']),
    fecha: leerTexto(valor['fecha']),
    profesionalId: leerTexto(valor['profesionalId']) || null,
  };
}

function linea(valor: unknown): LineaDeLaCuenta | null {
  if (!esRegistro(valor) || !leerTexto(valor['citaId'])) {
    return null;
  }
  return {
    citaId: leerTexto(valor['citaId']),
    numero: leerTexto(valor['numero']),
    inicio: leerTexto(valor['inicio']) || null,
    cobrado: leerNumero(valor['cobrado']),
    devuelto: leerNumero(valor['devuelto']),
    moneda: leerTexto(valor['moneda']),
  };
}

function total(valor: unknown): TotalDeLaCuenta | null {
  if (!esRegistro(valor) || !leerTexto(valor['moneda'])) {
    return null;
  }
  return {
    moneda: leerTexto(valor['moneda']),
    cobrado: leerNumero(valor['cobrado']),
    devuelto: leerNumero(valor['devuelto']),
    neto: leerNumero(valor['neto']),
  };
}
