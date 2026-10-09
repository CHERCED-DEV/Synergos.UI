import { idAleatorio, rechazoLocal, transportePorDefecto, type Enviar, type ResultadoDelFlujo } from './transporte';
import {
  OPERACIONES_DE_LA_PUERTA,
  crearClienteDeLaPuerta,
  esFlujo,
  type ArgsDe,
  type Flujo,
  type OperacionDe,
  type OperacionesDeLaPuerta,
  type RespuestaDe,
} from './puerta';

/**
 * `<synergos-flujo>`: el coordinador sin render de un flujo de negocio (ADR 0140, decisión 6 · F4).
 *
 * Vive en el DOM con `display: contents`, no pinta nada y hace de capa media entre los
 * participantes y la puerta: un participante PIDE una operación del flujo con un evento DOM y el
 * coordinador la lleva a `/api/flujos/{flujo}/{operacion}` con el cliente generado. El atributo es
 * una CLAVE de flujo, nunca una ruta: nada en el DOM es frontera de confianza, así que una clave
 * que la tabla no conoce no sale a la red.
 *
 * El protocolo v1, con el prefijo `synergos:` (el que usan la ADR 0138 y el disco):
 *  - `synergos:register` — descubrimiento SÍNCRONO por ancestro: contesta `responder`.
 *  - `synergos:submit-request` — `{protocolo, flujo, solicitud, operacion, consulta?, cuerpo?, llave?}`;
 *    lo atiende el ancestro más cercano DEL MISMO flujo, que lo marca `atendida` al vuelo y corta
 *    la propagación.
 *  - `synergos:submit-result` — se despacha en el solicitante, con su `solicitud`.
 *  - `synergos:flujo-ocupado` y `aria-busy` — un solo indicador de que hay algo en vuelo.
 *  - `synergos:flujo-presente` — el re-anuncio al conectarse, para el participante que espera.
 *
 * Lo que NO decide: el orden de las operaciones (lo secuencia el participante y lo hace cumplir el
 * servidor), la llave (la pone el participante), reintentar una escritura, traducir ni navegar.
 * `synergos:ready` y `synergos:navigate` quedan declarados y sin construir: no tienen productor
 * mientras redirigir-al-pago sea del #183.
 *
 * Lo DEFINE cada participante al cargar su bundle (`definirCoordinador()`, idempotente: la primera
 * definición gana). Como bundle aparte llegaría tarde y el pedido se perdería (medido en el plan de
 * la F4). Es la excepción escrita a la obligación 8 de la plataforma (CLAUDE.md del UI).
 */
export const PROTOCOLO_DEL_FLUJO = 1;
export const ETIQUETA_DEL_COORDINADOR = 'synergos-flujo';

export const EVENTOS_DEL_FLUJO = {
  registrar: 'synergos:register',
  pedir: 'synergos:submit-request',
  resultado: 'synergos:submit-result',
  ocupado: 'synergos:flujo-ocupado',
  presente: 'synergos:flujo-presente',
} as const;

export interface DetalleDeRegistro {
  readonly protocolo: number;
  readonly flujo: string;
  responder?: (info: { readonly flujo: string; readonly protocolo: number }) => void;
}

export interface DetalleDePeticion {
  readonly protocolo: number;
  readonly flujo: string;
  readonly solicitud: string;
  readonly operacion: string;
  readonly consulta?: Readonly<Record<string, unknown>>;
  readonly cuerpo?: unknown;
  readonly llave?: string;
  readonly senal?: AbortSignal;
  atendida?: boolean;
}

export interface DetalleDeResultado {
  readonly protocolo: number;
  readonly solicitud: string;
  readonly operacion: string;
  readonly outcome: 'success' | 'failure';
  readonly resultado: ResultadoDelFlujo<unknown>;
}

/** La instancia de `<synergos-flujo>`. `enviar` se puede sustituir (los specs lo hacen); si no, la cadena de siempre. */
export interface CoordinadorDelFlujo extends HTMLElement {
  enviar: Enviar | null;
  readonly flujo: string;
}

let clase: (new () => CoordinadorDelFlujo) | null = null;

/**
 * La clase del coordinador, creada al pedirla y no al importar el módulo: `vitals/core` se
 * importa entero desde las librerías que van al runtime compartido, y una clase que extiende
 * `HTMLElement` al nivel del módulo es un efecto que el empaquetador no puede quitar.
 */
export function claseDelCoordinador(): new () => CoordinadorDelFlujo {
  if (clase) return clase;
  class Coordinador extends HTMLElement implements CoordinadorDelFlujo {
    enviar: Enviar | null = null;

    readonly #participantes = new Set<Element>();
    readonly #enVuelo = new Map<string, Promise<ResultadoDelFlujo<unknown>>>();
    #pendientes = 0;

    get flujo(): string {
      return this.getAttribute('flujo') ?? '';
    }

    connectedCallback(): void {
      this.style.display = 'contents';
      this.addEventListener(EVENTOS_DEL_FLUJO.registrar, this.#alRegistrar);
      this.addEventListener(EVENTOS_DEL_FLUJO.pedir, this.#alPedir);
      this.ownerDocument.dispatchEvent(
        new CustomEvent(EVENTOS_DEL_FLUJO.presente, { detail: { protocolo: PROTOCOLO_DEL_FLUJO, flujo: this.flujo } }),
      );
    }

    disconnectedCallback(): void {
      this.removeEventListener(EVENTOS_DEL_FLUJO.registrar, this.#alRegistrar);
      this.removeEventListener(EVENTOS_DEL_FLUJO.pedir, this.#alPedir);
      this.#participantes.clear();
    }

    readonly #alRegistrar = (e: Event): void => {
      const d = (e as CustomEvent<DetalleDeRegistro>).detail;
      if (!d || d.flujo !== this.flujo) return;
      e.stopPropagation();
      const quien = e.composedPath()[0];
      if (quien instanceof Element) this.#participantes.add(quien);
      d.responder?.({ flujo: this.flujo, protocolo: PROTOCOLO_DEL_FLUJO });
    };

    readonly #alPedir = (e: Event): void => {
      const d = (e as CustomEvent<DetalleDePeticion>).detail;
      if (!d || d.flujo !== this.flujo) return;
      // El más cercano del MISMO flujo atiende, y sólo él: sin esto, dos coordinadores anidados
      // harían dos llamadas por un pedido.
      e.stopPropagation();
      d.atendida = true;
      const quien = e.composedPath()[0];
      if (quien instanceof Element) this.#participantes.add(quien);
      const contestar = (resultado: ResultadoDelFlujo<unknown>): void => {
        const detalle: DetalleDeResultado = {
          protocolo: PROTOCOLO_DEL_FLUJO,
          solicitud: d.solicitud,
          operacion: d.operacion,
          outcome: resultado.ok ? 'success' : 'failure',
          resultado,
        };
        if (quien instanceof Element) quien.dispatchEvent(new CustomEvent(EVENTOS_DEL_FLUJO.resultado, { detail: detalle }));
      };
      // Un envío que LANZA (un `enviar` sustituido, un defecto) también contesta: sin esta rama el
      // pedido no recibe nunca su `synergos:submit-result` y se cuelga.
      void this.#ejecutar(d)
        .catch((error: unknown): ResultadoDelFlujo<unknown> => ({ ok: false, correlacion: '', rechazo: rechazoLocal('cliente.fallo_interno', String(error)) }))
        .then(contestar);
    };

    #ejecutar(d: DetalleDePeticion): Promise<ResultadoDelFlujo<unknown>> {
      const flujo = this.flujo;
      if (d.protocolo !== PROTOCOLO_DEL_FLUJO) {
        return Promise.resolve({ ok: false, correlacion: '', rechazo: rechazoLocal('cliente.protocolo_distinto', String(d.protocolo)) });
      }
      if (!esFlujo(flujo)) {
        return Promise.resolve({ ok: false, correlacion: '', rechazo: rechazoLocal('cliente.flujo_desconocido', flujo) });
      }
      // Dos pedidos IDÉNTICOS en vuelo son una llamada (el doble clic): el segundo recibe la misma
      // respuesta. Uno distinto —otra llave, otro cuerpo— sale aparte.
      const clave = [d.operacion, JSON.stringify(d.consulta ?? null), d.llave ?? '', JSON.stringify(d.cuerpo ?? null)].join('|');
      const enCurso = this.#enVuelo.get(clave);
      if (enCurso) return enCurso;

      this.enviar ??= transportePorDefecto();
      const cliente = crearClienteDeLaPuerta<OperacionesDeLaPuerta>(OPERACIONES_DE_LA_PUERTA, this.enviar);
      this.#marcar(+1);
      const llamar = cliente.llamar as (f: string, o: string, a: unknown) => Promise<ResultadoDelFlujo<unknown>>;
      const promesa = llamar(flujo, d.operacion, { consulta: d.consulta, cuerpo: d.cuerpo, llave: d.llave, senal: d.senal }).finally(() => {
        this.#enVuelo.delete(clave);
        this.#marcar(-1);
      });
      this.#enVuelo.set(clave, promesa);
      return promesa;
    }

    #marcar(delta: number): void {
      const antes = this.#pendientes > 0;
      this.#pendientes += delta;
      const ahora = this.#pendientes > 0;
      if (antes === ahora) return;
      this.toggleAttribute('aria-busy', ahora);
      for (const p of [...this.#participantes]) {
        if (!p.isConnected) {
          this.#participantes.delete(p);
          continue;
        }
        p.dispatchEvent(new CustomEvent(EVENTOS_DEL_FLUJO.ocupado, { detail: { ocupado: ahora } }));
      }
    }
  }
  clase = Coordinador;
  return clase;
}

/**
 * Define `<synergos-flujo>` si nadie lo definió. Idempotente: lo llama cada participante al cargar,
 * y con dos bundles en la página gana el primero; `PROTOCOLO_DEL_FLUJO` protege que convivan.
 */
export function definirCoordinador(registro: CustomElementRegistry | undefined = globalThis.customElements): void {
  if (registro && !registro.get(ETIQUETA_DEL_COORDINADOR)) registro.define(ETIQUETA_DEL_COORDINADOR, claseDelCoordinador());
}

/**
 * ¿Hay un coordinador de este flujo por encima? Síncrono, y deja al participante registrado (recibe
 * `synergos:flujo-ocupado`). Sin coordinador, la compra dice que no está disponible y no toca la red.
 */
export function hayCoordinador(desde: Element, flujo: Flujo): boolean {
  let atendido = false;
  desde.dispatchEvent(
    new CustomEvent<DetalleDeRegistro>(EVENTOS_DEL_FLUJO.registrar, {
      bubbles: true,
      composed: true,
      detail: { protocolo: PROTOCOLO_DEL_FLUJO, flujo, responder: () => (atendido = true) },
    }),
  );
  return atendido;
}

export interface OpcionesDePedido {
  /** Cuánto esperar el re-anuncio de un coordinador que todavía no se definió. Por defecto, nada. */
  readonly esperarCoordinadorMs?: number;
}

/**
 * Pide una operación al coordinador más cercano del flujo. Sin coordinador contesta AL INSTANTE
 * `cliente.sin_coordinador` en vez de colgarse. El id de cada solicitud es global y al azar
 * (`idAleatorio`, sobre `crypto.getRandomValues`: `randomUUID` no existe sin https), no un contador
 * del módulo: con N bundles en la página habría N contadores (regla 60).
 */
export function pedirAlFlujo<F extends Flujo, O extends OperacionDe<F>>(
  desde: Element,
  flujo: F,
  operacion: O,
  args: ArgsDe<OperacionesDeLaPuerta[F][O]>,
  opciones: OpcionesDePedido = {},
): Promise<ResultadoDelFlujo<RespuestaDe<OperacionesDeLaPuerta[F][O]>>> {
  const a = args as { consulta?: Readonly<Record<string, unknown>>; cuerpo?: unknown; llave?: string; senal?: AbortSignal };
  const intentar = (): Promise<ResultadoDelFlujo<unknown>> | null => {
    const solicitud = idAleatorio();
    let resolver!: (r: ResultadoDelFlujo<unknown>) => void;
    const promesa = new Promise<ResultadoDelFlujo<unknown>>((r) => (resolver = r));
    const alResultado = (e: Event): void => {
      const d = (e as CustomEvent<DetalleDeResultado>).detail;
      if (d?.solicitud !== solicitud) return;
      desde.removeEventListener(EVENTOS_DEL_FLUJO.resultado, alResultado);
      resolver(d.resultado);
    };
    desde.addEventListener(EVENTOS_DEL_FLUJO.resultado, alResultado);
    const detalle: DetalleDePeticion = {
      protocolo: PROTOCOLO_DEL_FLUJO,
      flujo,
      solicitud,
      operacion,
      consulta: a.consulta,
      cuerpo: a.cuerpo,
      llave: a.llave,
      senal: a.senal,
    };
    desde.dispatchEvent(new CustomEvent(EVENTOS_DEL_FLUJO.pedir, { bubbles: true, composed: true, detail: detalle }));
    if (detalle.atendida) return promesa;
    desde.removeEventListener(EVENTOS_DEL_FLUJO.resultado, alResultado);
    return null;
  };
  const sinCoordinador = (): ResultadoDelFlujo<never> => ({
    ok: false,
    correlacion: '',
    rechazo: rechazoLocal('cliente.sin_coordinador', `${flujo}/${operacion}`),
  });

  const primero = intentar();
  if (primero) return primero as Promise<ResultadoDelFlujo<never>>;
  const espera = opciones.esperarCoordinadorMs ?? 0;
  if (espera <= 0) return Promise.resolve(sinCoordinador());
  return new Promise((fin) => {
    const doc = desde.ownerDocument;
    const alPresente = (): void => {
      const otra = intentar();
      if (!otra) return;
      clearTimeout(reloj);
      doc.removeEventListener(EVENTOS_DEL_FLUJO.presente, alPresente);
      void otra.then((r) => fin(r as ResultadoDelFlujo<never>));
    };
    const reloj = setTimeout(() => {
      doc.removeEventListener(EVENTOS_DEL_FLUJO.presente, alPresente);
      fin(sinCoordinador());
    }, espera);
    doc.addEventListener(EVENTOS_DEL_FLUJO.presente, alPresente);
  });
}
