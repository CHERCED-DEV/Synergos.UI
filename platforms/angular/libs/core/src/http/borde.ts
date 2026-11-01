/**
 * La fontanería de los adaptadores que hablan con el borde del CMS (014-despiece-tienda, T009): llamar sólo con la base
 * de la API, pedir JSON, y leer una respuesta suelta sin confiar en su forma. Era la parte común de los clientes de la
 * tienda y de la consola del vendedor, escrita dos veces igual.
 */

/**
 * `fetch`, pero sin `apiBase` no llama a nada —ni a una ruta del propio sitio, que podría ser de otra cosa—: la base es
 * configuración del despliegue (ADR 0137) y no hay una de respaldo compilada. Rechaza, y cada llamada degrada como ante
 * cualquier caída.
 */
export function llamarAlBorde(apiBase: string, url: string, init?: RequestInit): Promise<Response> {
  return apiBase ? fetch(url, init) : Promise.reject(new Error('sin-api'));
}

/** Una LECTURA que el servidor contestó con un estado que no es 2xx: el estado viaja, para saber si fue la sesión. */
export class LecturaRechazada extends Error {
  constructor(readonly estado: number) {
    super(`HTTP ${estado}`);
    this.name = 'LecturaRechazada';
  }
}

/**
 * Pide JSON al borde. Sin `apiBase` no se llama a nada (ver {@link llamarAlBorde}); un estado que no es 2xx rechaza con
 * {@link LecturaRechazada}.
 */
export function pedirJsonAlBorde(apiBase: string, url: string, init: RequestInit): Promise<unknown> {
  if (typeof fetch !== 'function') {
    return Promise.reject(new Error('fetch-unavailable'));
  }
  if (!apiBase) {
    return Promise.reject(new Error('sin-api'));
  }
  return llamarAlBorde(apiBase, url, {
    ...init,
    headers: { Accept: 'application/json', ...(init.headers ?? {}) },
  }).then((response) =>
    response.ok ? response.json() : Promise.reject(new LecturaRechazada(response.status)),
  );
}

/** `GET` de JSON al borde. */
export function leerJsonDelBorde(apiBase: string, url: string): Promise<unknown> {
  return pedirJsonAlBorde(apiBase, url, { method: 'GET' });
}

/** `POST` de JSON al borde. */
export function enviarJsonAlBorde(apiBase: string, url: string, body: unknown): Promise<unknown> {
  return pedirJsonAlBorde(apiBase, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Lectores defensivos: toleran una forma parcial o suelta ─────────────────

export function esRegistro(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function leerTexto(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

export function leerNumero(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function leerBooleano(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return fallback;
}

export function leerTextos(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(leerTexto).filter((entry) => entry !== '') : [];
}
