import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, type OnDestroy, PLATFORM_ID, inject } from '@angular/core';

export type LivePoliteness = 'polite' | 'assertive';

/** Marca de LA región del documento: la leen los specs de gov y blogs y la reusa otra app. */
const ATRIBUTO = 'data-syn-live-announcer';

/**
 * Cuánto se espera entre vaciar la región y poner el mensaje. Algunas combinaciones de
 * navegador y lector no anuncian sin un retardo no nulo (lo documenta el `LiveAnnouncer` del
 * CDK), y es lo que hace que un mensaje IDÉNTICO al anterior se vuelva a oír: el DOM pasa por
 * vacío y cambia de verdad.
 */
const RETARDO_MS = 100;

/**
 * El anunciador de UN documento (#82).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **Por qué vive fuera de la DI de Angular.** Cada custom element arranca su propia aplicación
 * (`registrarElementoAngular` hace un `createApplication` por tag), así que un servicio
 * `providedIn: 'root'` es uno POR ELEMENTO. Con la región colgada de cada instancia, una página
 * con dos elementos que anuncian tendría dos regiones compitiendo, y copiar lo que hace el CDK
 * —borrar las regiones previas al crear la suya— le robaría la región al vecino. `@synergos/shared`
 * es un external del runtime (un solo módulo por página), así que el anunciador vive a nivel de
 * módulo y es UNO por documento: las apps que lo piden lo comparten, y quien no tiene inyector
 * (el `cartStore` de `libs/shop`, un singleton de módulo) también lo alcanza.
 *
 * Lo que hace, contra los cinco huecos que midió el informe 12 frente al CDK:
 *
 *  1. la región se crea al PEDIR el anunciador —al inyectar el servicio—, no en el primer
 *     `announce()`: existe mucho antes del primer mensaje y persiste;
 *  2. cambiar de cortesía cambia el atributo, no recrea el nodo;
 *  3. sin `role="status"`: con `assertive` era `status`+`assertive`, contradictorio. `aria-live`
 *     + `aria-atomic` bastan (el CDK tampoco pone rol);
 *  4. con un diálogo `aria-modal` VISIBLE abierto, la región se le cuelga por `aria-owns`
 *     mientras dura el mensaje —algunos navegadores sacan del árbol de accesibilidad lo que está
 *     fuera del modal—, y se le descuelga al limpiar. Un modal oculto (`aria-hidden`, `hidden`,
 *     `inert`, `display:none`) NO: el cajón de `cart-summary` vive en el DOM con
 *     `aria-modal="true"` + `aria-hidden="true"` cuando está cerrado, y colgarle la región la
 *     escondería;
 *  5. una sola región por documento, aunque la pidan N aplicaciones.
 *
 * Y la limpieza: el texto se borra a los `duration` ms, y la región se quita del DOM cuando se
 * destruye la última aplicación que la pidió (`liberar`).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export class DocumentLiveAnnouncer {
  readonly #documento: Document;
  #region: HTMLElement | null = null;
  #anuncio: ReturnType<typeof setTimeout> | null = null;
  #limpieza: ReturnType<typeof setTimeout> | null = null;
  /** Los modales a los que se colgó la región, para descolgarla al limpiar. */
  #dueños: Element[] = [];
  /** Cuántas aplicaciones la retienen. Con cero, la región se quita del DOM. */
  #retenciones = 0;

  constructor(documento: Document) {
    this.#documento = documento;
    // Temprano, pero nunca a costa de reventar un arranque: sin <body> todavía, se crea en el
    // primer anuncio. Un throw al importar un módulo del runtime tumba el registro del elemento
    // entero (la lección del `effect()` de `cart.store`).
    if (documento.body) {
      this.region();
    }
  }

  /**
   * LA región del documento: la que ya hay —la creó otra aplicación, o este mismo anunciador
   * antes de que alguien vaciara el `<body>`— o una nueva. Nunca dos.
   */
  region(): HTMLElement {
    if (this.#region?.isConnected) {
      return this.#region;
    }
    const existente = this.#documento.querySelector<HTMLElement>(`[${ATRIBUTO}]`);
    this.#region = existente ?? this.#crear();
    return this.#region;
  }

  announce(message: string, politeness: LivePoliteness = 'polite', duration = 3000): void {
    const region = this.region();
    this.#pararTemporizadores();
    this.#descolgar();

    if (region.getAttribute('aria-live') !== politeness) {
      region.setAttribute('aria-live', politeness);
    }
    region.textContent = '';

    this.#anuncio = setTimeout(() => {
      this.#anuncio = null;
      const actual = this.region();
      // Se cuelga AHORA y no al llamar: el que anuncia suele abrir el modal en el mismo turno
      // (agregar al carrito abre el cajón), y el modal recién se hace visible en el render.
      this.#colgarDelModal(actual);
      actual.textContent = message;
    }, RETARDO_MS);

    this.#limpieza = setTimeout(() => {
      this.#limpieza = null;
      this.clear();
    }, Math.max(duration, RETARDO_MS + 1));
  }

  clear(): void {
    this.#pararTemporizadores();
    this.#descolgar();
    if (this.#region) {
      this.#region.textContent = '';
    }
  }

  /** Una aplicación más usa la región. */
  retener(): void {
    this.#retenciones += 1;
    this.region();
  }

  /** Una aplicación menos. La última en irse se lleva la región y sus temporizadores. */
  liberar(): void {
    this.#retenciones = Math.max(0, this.#retenciones - 1);
    if (this.#retenciones > 0) {
      return;
    }
    this.clear();
    this.#region?.remove();
    this.#region = null;
    ANUNCIADORES.delete(this.#documento);
  }

  #crear(): HTMLElement {
    const region = this.#documento.createElement('div');
    region.id = `syn-live-announcer-${(DocumentLiveAnnouncer.#secuencia += 1)}`;
    region.setAttribute(ATRIBUTO, 'true');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    region.style.cssText = [
      'position:absolute',
      'width:1px',
      'height:1px',
      'padding:0',
      'margin:-1px',
      'overflow:hidden',
      'clip:rect(0, 0, 0, 0)',
      'white-space:nowrap',
      'border:0',
    ].join(';');
    (this.#documento.body ?? this.#documento.documentElement).appendChild(region);
    return region;
  }

  static #secuencia = 0;

  /**
   * El último modal VISIBLE del documento se adueña de la región mientras dura el mensaje. Uno
   * solo: un elemento con dos dueños por `aria-owns` es inválido.
   */
  #colgarDelModal(region: HTMLElement): void {
    const modales = Array.from(this.#documento.querySelectorAll('[aria-modal="true"]')).filter(
      (modal) => !modal.contains(region) && esVisible(modal),
    );
    const modal = modales.at(-1);
    if (!modal) {
      return;
    }
    const ids = (modal.getAttribute('aria-owns') ?? '').split(/\s+/).filter(Boolean);
    if (!ids.includes(region.id)) {
      modal.setAttribute('aria-owns', [...ids, region.id].join(' '));
      this.#dueños.push(modal);
    }
  }

  #descolgar(): void {
    const id = this.#region?.id;
    for (const modal of this.#dueños) {
      const resto = (modal.getAttribute('aria-owns') ?? '')
        .split(/\s+/)
        .filter((x) => x && x !== id);
      if (resto.length > 0) {
        modal.setAttribute('aria-owns', resto.join(' '));
      } else {
        modal.removeAttribute('aria-owns');
      }
    }
    this.#dueños = [];
  }

  #pararTemporizadores(): void {
    if (this.#anuncio !== null) {
      clearTimeout(this.#anuncio);
      this.#anuncio = null;
    }
    if (this.#limpieza !== null) {
      clearTimeout(this.#limpieza);
      this.#limpieza = null;
    }
  }
}

/** Un modal cerrado que sigue en el DOM no puede adueñarse de la región: la escondería. */
function esVisible(elemento: Element): boolean {
  if (elemento.closest('[hidden], [inert], [aria-hidden="true"]')) {
    return false;
  }
  const vista = elemento.ownerDocument.defaultView;
  if (!vista) {
    return true;
  }
  for (let nodo: Element | null = elemento; nodo; nodo = nodo.parentElement) {
    const estilo = vista.getComputedStyle(nodo);
    if (estilo.display === 'none' || estilo.visibility === 'hidden') {
      return false;
    }
  }
  return true;
}

const ANUNCIADORES = new WeakMap<Document, DocumentLiveAnnouncer>();

/**
 * El anunciador del documento, para quien no tiene inyector. Quien sí lo tiene inyecta
 * `LiveAnnouncerService`, que es este mismo anunciador enchufado a la DI.
 */
export function documentLiveAnnouncer(documento: Document): DocumentLiveAnnouncer {
  let anunciador = ANUNCIADORES.get(documento);
  if (!anunciador) {
    anunciador = new DocumentLiveAnnouncer(documento);
    ANUNCIADORES.set(documento, anunciador);
  }
  return anunciador;
}

/**
 * El camino ÚNICO para mensajes de EVENTO (agregado, copiado, página cargada, error de red):
 * una región que existe antes que el mensaje, así que da igual si quien anuncia vive dentro de un
 * `@if` (regla 42 del `CLAUDE.md`). Para anunciar desde una plantilla, `syn-live-region` es su
 * fachada declarativa.
 */
@Injectable({ providedIn: 'root' })
export class LiveAnnouncerService implements OnDestroy {
  readonly #anunciador: DocumentLiveAnnouncer | null;

  constructor() {
    const documento = inject(DOCUMENT);
    this.#anunciador = isPlatformBrowser(inject(PLATFORM_ID)) ? documentLiveAnnouncer(documento) : null;
    this.#anunciador?.retener();
  }

  announce(message: string, politeness: LivePoliteness = 'polite', duration = 3000): void {
    this.#anunciador?.announce(message, politeness, duration);
  }

  clear(): void {
    this.#anunciador?.clear();
  }

  ngOnDestroy(): void {
    this.#anunciador?.liberar();
  }
}
