/**
 * El transporte de los flujos: una cadena de interceptores sobre `fetch`, sin framework (ADR 0140,
 * decisión 6 · F4).
 *
 *   correlación ⊃ reintento de lecturas ⊃ telemetría ⊃ fetch
 *
 * Devuelve un resultado discriminado y NO lanza: una negativa del servidor no es una caída (regla
 * 59), y quien llama decide por `code` y `transient`, nunca por `title` ni por el estado HTTP. La
 * puerta pone en `title` la frase HTTP («Unauthorized») y contesta 503 `puerta.flujo_no_disponible`
 * con `transient: false`: un `switch` por cualquiera de los dos fallaría en silencio.
 */

/** La cabecera que el CMS acepta, limpia a letras y dígitos ASCII (hasta 32) y devuelve. */
export const CABECERA_DE_CORRELACION = 'X-Correlation-Id';

/**
 * El techo propio de una petición: más que los 25 s de la puerta y los 30 s del CMS, para que
 * quien conteste un tiempo agotado sea el servidor —con su `code`— y no el navegador, salvo que el
 * servidor no conteste nada.
 */
export const TECHO_DE_UNA_PETICION_MS = 35_000;

export interface Peticion {
  readonly metodo: 'GET' | 'POST';
  readonly url: string;
  readonly cabeceras: Readonly<Record<string, string>>;
  readonly cuerpo?: string;
  readonly senal?: AbortSignal;
  /** Lo que la telemetría nombra: la operación, nunca la URL con sus parámetros. */
  readonly etiqueta: string;
}

/**
 * Un «no», venga del servidor (`origen: 'servidor'`, con su `code`), de la red o de una respuesta
 * que no trae un rechazo legible (`'forma'`). Lo que el servidor agrega al rechazo —el
 * `purchaseStatus` del artefacto— queda en `extra`.
 */
export interface RechazoDelFlujo {
  readonly code: string;
  readonly status: number;
  readonly transient: boolean;
  readonly detail: string;
  readonly origen: 'servidor' | 'red' | 'forma';
  readonly extra: Readonly<Record<string, unknown>>;
}

export type ResultadoDelFlujo<T> =
  | { readonly ok: true; readonly valor: T; readonly estado: number; readonly correlacion: string }
  | { readonly ok: false; readonly rechazo: RechazoDelFlujo; readonly correlacion: string };

export type Enviar = (peticion: Peticion) => Promise<ResultadoDelFlujo<unknown>>;
export type Interceptor = (siguiente: Enviar) => Enviar;

/**
 * 32 hex al azar, sobre `crypto.getRandomValues`, que existe en TODO contexto. `crypto.randomUUID`
 * sólo existe en un contexto SEGURO (https o localhost): en http://synergos.local:5000 o en el
 * Docker por HTTP vale `undefined`, y llamarlo lanzaba antes de salir a la red — la compra decía
 * «no se te cobró nada» sin una sola petición y el enlace del aviso se quedaba cargando (ADR 0140
 * F4, medido en Chromium con isSecureContext=false).
 */
export function idAleatorio(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 32 hex sin guiones: la forma que el CMS conserva entera, así que navegador, CMS y árbol registran UN id. */
export function nuevaCorrelacion(): string {
  return idAleatorio();
}

const CODIGO = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

export function rechazoLocal(code: string, detail: string, transient = false, origen: RechazoDelFlujo['origen'] = 'forma', status = 0): RechazoDelFlujo {
  return { code, status, transient, detail, origen, extra: {} };
}

/**
 * Lee el rechazo de una respuesta no-2xx por su `code`. Sin un `code` legible —un 502 en HTML de un
 * proxy, un cuerpo vacío— es un rechazo de FORMA, transitorio si es 5xx.
 *
 * El cuerpo que no se lee se suelta SIN esperar: `await body.cancel()` sobre una rama de un `tee`
 * (lo que deja un `Response.clone()`) no vuelve nunca (medido en el plan de la F4: el test se colgó
 * hasta su límite; con `void` pasa en 17 ms).
 */
export async function leerRechazo(respuesta: Response): Promise<RechazoDelFlujo> {
  const tipo = respuesta.headers.get('content-type') ?? '';
  if (tipo.includes('json')) {
    try {
      const cuerpo: unknown = await respuesta.json();
      if (typeof cuerpo === 'object' && cuerpo !== null && !Array.isArray(cuerpo)) {
        const r = cuerpo as Record<string, unknown>;
        const code = typeof r['code'] === 'string' && CODIGO.test(r['code']) ? r['code'] : null;
        if (code) {
          const extra: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(r)) {
            if (!['code', 'transient', 'detail', 'status', 'type', 'title'].includes(k) && v !== null && v !== undefined) {
              extra[k] = v;
            }
          }
          return {
            code,
            status: respuesta.status,
            transient: r['transient'] === true,
            detail: typeof r['detail'] === 'string' ? r['detail'] : '',
            origen: 'servidor',
            extra,
          };
        }
      }
    } catch {
      // Un JSON roto es lo mismo que no traer rechazo: cae a la forma.
    }
  } else {
    void respuesta.body?.cancel().catch(() => undefined);
  }
  return rechazoLocal('cliente.respuesta_sin_codigo', `HTTP ${respuesta.status} sin un rechazo que leer`, respuesta.status >= 500, 'forma', respuesta.status);
}

export interface OpcionesDeEnvio {
  readonly hacerFetch?: typeof fetch;
  readonly techoMs?: number;
}

/**
 * El último eslabón: `fetch` con la cookie del mismo origen, sin caché y sin seguir redirecciones.
 *
 * `redirect: 'manual'` y no `'error'`: un proxy que manda al login devolvería un error de red, que
 * parece una caída transitoria e invita a reintentar en vano. Con `'manual'` llega como
 * `opaqueredirect` y sale `cliente.redirigido`, que se trata como falta de sesión.
 */
export function crearEnvioPorFetch(opciones: OpcionesDeEnvio = {}): Enviar {
  const hacerFetch = opciones.hacerFetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const techoMs = opciones.techoMs ?? TECHO_DE_UNA_PETICION_MS;
  return async (p) => {
    const correlacion = p.cabeceras[CABECERA_DE_CORRELACION] ?? '';
    const control = new AbortController();
    let agotado = false;
    const reloj = setTimeout(() => {
      agotado = true;
      control.abort();
    }, techoMs);
    const alCancelar = (): void => control.abort();
    p.senal?.addEventListener('abort', alCancelar, { once: true });
    try {
      let respuesta: Response;
      try {
        respuesta = await hacerFetch(p.url, {
          method: p.metodo,
          headers: { Accept: 'application/json', ...p.cabeceras },
          body: p.cuerpo,
          signal: control.signal,
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'manual',
        });
      } catch (error) {
        if (agotado) {
          return { ok: false, correlacion, rechazo: rechazoLocal('cliente.tiempo_agotado', `sin respuesta en ${techoMs} ms`, true, 'red') };
        }
        if (p.senal?.aborted) {
          return { ok: false, correlacion, rechazo: rechazoLocal('cliente.cancelada', 'cancelada', false, 'red') };
        }
        return { ok: false, correlacion, rechazo: rechazoLocal('cliente.sin_red', String(error), true, 'red') };
      }
      if (respuesta.type === 'opaqueredirect') {
        return { ok: false, correlacion, rechazo: rechazoLocal('cliente.redirigido', 'la respuesta fue una redirección', false, 'forma') };
      }
      const devuelta = respuesta.headers.get(CABECERA_DE_CORRELACION) ?? correlacion;
      if (!respuesta.ok) {
        return { ok: false, correlacion: devuelta, rechazo: await leerRechazo(respuesta) };
      }
      try {
        return { ok: true, valor: await respuesta.json(), estado: respuesta.status, correlacion: devuelta };
      } catch {
        if (agotado) {
          return { ok: false, correlacion: devuelta, rechazo: rechazoLocal('cliente.tiempo_agotado', `sin respuesta en ${techoMs} ms`, true, 'red') };
        }
        return { ok: false, correlacion: devuelta, rechazo: rechazoLocal('cliente.respuesta_ilegible', 'el 2xx no trae JSON', false, 'forma', respuesta.status) };
      }
    } finally {
      clearTimeout(reloj);
      p.senal?.removeEventListener('abort', alCancelar);
    }
  };
}

/** Pone la correlación UNA vez por petición, por fuera del reintento: todos los intentos la comparten. */
export const correlacion =
  (generar: () => string = nuevaCorrelacion): Interceptor =>
  (siguiente) =>
  (p) =>
    siguiente(p.cabeceras[CABECERA_DE_CORRELACION] ? p : { ...p, cabeceras: { ...p.cabeceras, [CABECERA_DE_CORRELACION]: generar() } });

export interface OpcionesDeReintento {
  readonly intentos: number;
  readonly espera: (intento: number) => number;
  readonly dormir?: (ms: number, senal?: AbortSignal) => Promise<void>;
}

const dormirDeVerdad = (ms: number, senal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolver) => {
    const t = setTimeout(resolver, ms);
    senal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolver();
      },
      { once: true },
    );
  });

/**
 * Reintenta SÓLO las lecturas, y sólo lo transitorio. Una escritura transitoria (un 503
 * `flow.busy` al cerrar, un 504) vuelve UNA vez al llamador: el reintento lo decide la persona, con
 * la misma llave o el mismo id, que es lo que el servidor hace idempotente.
 */
export const reintentoDeLecturas =
  (o: OpcionesDeReintento): Interceptor =>
  (siguiente) =>
  async (p) => {
    let r = await siguiente(p);
    if (p.metodo !== 'GET') return r;
    for (let intento = 1; intento <= o.intentos && !r.ok && r.rechazo.transient && !p.senal?.aborted; intento += 1) {
      await (o.dormir ?? dormirDeVerdad)(o.espera(intento), p.senal);
      r = await siguiente(p);
    }
    return r;
  };

/** Una medida por INTENTO. Sin cuerpo ni datos personales: la etiqueta, el resultado y cuánto tardó. */
export interface Medida {
  readonly etiqueta: string;
  readonly metodo: Peticion['metodo'];
  readonly ok: boolean;
  readonly status: number;
  readonly code: string | null;
  readonly transient: boolean;
  readonly ms: number;
  readonly correlacion: string;
}

export const telemetria =
  (emitir: (m: Medida) => void, reloj: () => number = () => performance.now()): Interceptor =>
  (siguiente) =>
  async (p) => {
    const t0 = reloj();
    const r = await siguiente(p);
    try {
      emitir({
        etiqueta: p.etiqueta,
        metodo: p.metodo,
        ok: r.ok,
        status: r.ok ? r.estado : r.rechazo.status,
        code: r.ok ? null : r.rechazo.code,
        transient: r.ok ? false : r.rechazo.transient,
        ms: Math.round(reloj() - t0),
        correlacion: r.correlacion,
      });
    } catch {
      // La telemetría nunca rompe una compra.
    }
    return r;
  };

export function componer(base: Enviar, ...interceptores: readonly Interceptor[]): Enviar {
  return interceptores.reduceRight<Enviar>((siguiente, i) => i(siguiente), base);
}

/**
 * La telemetría como evento DOM opt-in (`synergos:telemetria`): el host decide si escucha. No hay
 * un endpoint de telemetría en el CMS, y no se inventa uno.
 */
export function emitirComoEvento(destino: EventTarget = globalThis): (m: Medida) => void {
  return (m) => {
    if (typeof CustomEvent === 'function') destino.dispatchEvent(new CustomEvent('synergos:telemetria', { detail: m }));
  };
}

export interface OpcionesDelTransporte extends OpcionesDeEnvio {
  readonly dormir?: OpcionesDeReintento['dormir'];
  readonly emitir?: (m: Medida) => void;
}

/**
 * La cadena de siempre: correlación ⊃ reintento de lecturas (2, con retroceso) ⊃ telemetría ⊃
 * fetch. El orden ES el comportamiento: la correlación por fuera del reintento es la que hace que
 * todos los intentos compartan un id, y la telemetría por dentro, que mida cada intento.
 */
export function transportePorDefecto(o: OpcionesDelTransporte = {}): Enviar {
  return componer(
    crearEnvioPorFetch(o),
    correlacion(),
    reintentoDeLecturas({ intentos: 2, espera: (i) => 250 * 3 ** (i - 1), dormir: o.dormir }),
    telemetria(o.emitir ?? emitirComoEvento(globalThis)),
  );
}
