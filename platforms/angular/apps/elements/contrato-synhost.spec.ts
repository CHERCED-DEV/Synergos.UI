// El gate de vocabulario (al final) lee las FUENTES de los elementos y su línea base: este spec
// corre en Node (vitest), y el programa de specs no carga los tipos de Node por defecto.
/// <reference types="node" />
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CLAVES_DE_ENVOLTURA_SYNHOST, ELEMENTOS_SYNHOST, type SelectorSynHost } from '@synergos/contracts';
import { createConfigInputTransform, type ConfigInputSanitizer } from '@synergos/shared';
import { sanitizeKpiCardConfig } from './modules/kpi-card/src/kpi-card/kpi-card';
import { sanitizeDropdownConfig } from './compositions/dropdown/src/dropdown/dropdown';
import { sanitizeCarouselConfig } from './modules/carousel/src/carousel/carousel';
import { sanitizeRatingStarsConfig } from './compositions/rating-stars/src/rating-stars/rating-stars';
import { sanitizeTagConfig } from './primitives/tag/src/tag/tag';
import { sanitizeScrollTopConfig } from './primitives/scroll-top/src/scroll-top/scroll-top';
import { sanitizeRangeSliderConfig } from './compositions/range-slider/src/range-slider/range-slider';
import { sanitizeSelectMultiConfig } from './compositions/select-multi/src/select-multi/select-multi';
import { sanitizeStepperConfig } from './compositions/stepper/src/stepper/stepper';
import { sanitizeTabsConfig } from './compositions/tabs/src/tabs/tabs';
import { sanitizeTimelineConfig } from './modules/timeline/src/timeline/timeline';
import { sanitizeTourGuideConfig } from './modules/tour-guide/src/tour-guide/tour-guide';
import { sanitizeTreeViewConfig } from './modules/tree-view/src/tree-view/tree-view';
import { sanitizeAccordionConfig } from './compositions/accordion/src/accordion/accordion';
import { sanitizeBadgeGroupConfig } from './compositions/badge-group/src/badge-group/badge-group';
import { sanitizeBreadcrumbConfig } from './primitives/breadcrumb/src/breadcrumb/breadcrumb';
import { sanitizeColorSwatchesConfig } from './compositions/color-swatches/src/color-swatches/color-swatches';
import { sanitizeIconLabelConfig } from './primitives/icon-label/src/icon-label/icon-label';
import { sanitizeNotificationToastConfig } from './modules/notification-toast/src/notification-toast/notification-toast';
import { sanitizeProgressBarConfig } from './primitives/progress-bar/src/progress-bar/progress-bar';
import { sanitizeAudioPlayerConfig } from './modules/audio-player/src/audio-player/audio-player';
import { sanitizeAvatarConfig } from './primitives/avatar/src/avatar/avatar';
import { sanitizeVideoPlayerConfig } from './modules/video-player/src/video-player/video-player';
import { sanitizeHeroBannerConfig } from './modules/hero-banner/src/hero-banner/hero-banner';
import { sanitizeFabConfig } from './primitives/fab/src/fab/fab';
import { sanitizeCookieConsentConfig } from './modules/cookie-consent/src/cookie-consent/cookie-consent';
import { sanitizeShareBarConfig } from './compositions/share-bar/src/share-bar/share-bar';
import { sanitizeRichTooltipConfig } from './compositions/rich-tooltip/src/rich-tooltip/rich-tooltip';
import { sanitizeCountdownClockConfig } from './modules/countdown-clock/src/countdown-clock/countdown-clock';
import { sanitizeCountdownDigitalConfig } from './modules/countdown-digital/src/countdown-digital/countdown-digital';
import { sanitizeAvatarGroupConfig } from './compositions/avatar-group/src/avatar-group/avatar-group';
import { sanitizeLightboxGalleryConfig } from './modules/lightbox-gallery/src/lightbox-gallery/lightbox-gallery';
import { sanitizeChartBarConfig } from './modules/chart-bar/src/chart-bar/chart-bar';
import { sanitizeMapPinConfig } from './modules/map-pin/src/map-pin/map-pin';
import { sanitizeColorPickerConfig } from './compositions/color-picker/src/color-picker/color-picker';
import { sanitizeAppLauncherConfig } from './modules/app-launcher/src/app-launcher/app-launcher';
import { sanitizeEventosConfig } from './modules/eventos/src/eventos/eventos';
import { sanitizeRealtyConfig } from './modules/realty/src/realty/realty';
import { sanitizeAcademyConfig } from './modules/academy/src/academy/academy';
import { sanitizeBlogsConfig } from './modules/blogs/src/blogs/blogs';
import { sanitizeGovConfig } from './modules/gov/src/gov/gov';
import { sanitizeSellerConfig } from './modules/seller/src/seller/seller';
import { sanitizeStorefrontConfig } from './modules/storefront/src/storefront/storefront';
import { sanitizeTravelShellConfig } from './modules/travel-shell/src/travel-shell/travel-shell';
import { sanitizeEhrConfig } from './modules/ehr/src/ehr/ehr';
import { sanitizeBookingWizardConfig } from './modules/booking-wizard/src/booking-wizard/booking-wizard';
import { sanitizeFormStepperConfig } from './compositions/form-stepper/src/form-stepper/form-stepper';
import { sanitizeDataGridConfig } from './modules/data-grid/src/data-grid/data-grid';
import { sanitizeSearchBoxConfig } from './compositions/search-box/src/search-box/search-box';
import { sanitizeSeparatorConfig } from './primitives/separator/src/separator/separator';

/** Un sanitizador tal como lo exporta su elemento, con el tipo de su record. */
type Sanitizador = (value: never) => unknown;

/**
 * El gate que EJECUTA el sanitizador de cada elemento con el `config` que emite su vista
 * (ADR 0135 · CMS#173).
 *
 * El tipado ya impide leer una clave que el CMS no manda (TS2339). Lo que el tipado NO ve es
 * la mitad contraria: una clave que el CMS manda, que el tipo acepta y que el sanitizador
 * tira —o no lee—. Es la forma exacta en que se midió D1: sanitizador ejecutado con el payload
 * de la vista. Acá el payload no se inventa: es el `ejemplo` del contrato, que el CMS saca de
 * su resolver y su emitter REALES.
 *
 * Cada entrada de esta tabla es un sanitizador envuelto como lo envuelve su componente
 * (`createConfigInputTransform`), así que corre el mismo camino que el atributo `config`.
 * La tabla es a mano, y por eso se cruza en los dos sentidos con el contrato: un elemento
 * con contrato y sin sanitizador acá se pone rojo, que es la red de seguridad por el vacío.
 *
 * Se escribe con los sanitizadores CRUDOS y la envuelta se deriva: el gate de vocabulario
 * (CMS#181, al final) necesita el NOMBRE de cada uno para encontrar su fuente.
 */
const CRUDOS: Readonly<Record<string, Sanitizador>> = {
  carousel: sanitizeCarouselConfig,
  dropdown: sanitizeDropdownConfig,
  'kpi-card': sanitizeKpiCardConfig,
  'rating-stars': sanitizeRatingStarsConfig,
  tag: sanitizeTagConfig,
  'scroll-top': sanitizeScrollTopConfig,
  'range-slider': sanitizeRangeSliderConfig,
  'select-multi': sanitizeSelectMultiConfig,
  stepper: sanitizeStepperConfig,
  tabs: sanitizeTabsConfig,
  timeline: sanitizeTimelineConfig,
  'tour-guide': sanitizeTourGuideConfig,
  'tree-view': sanitizeTreeViewConfig,
  accordion: sanitizeAccordionConfig,
  'badge-group': sanitizeBadgeGroupConfig,
  breadcrumb: sanitizeBreadcrumbConfig,
  'color-swatches': sanitizeColorSwatchesConfig,
  'icon-label': sanitizeIconLabelConfig,
  'notification-toast': sanitizeNotificationToastConfig,
  'progress-bar': sanitizeProgressBarConfig,
  'audio-player': sanitizeAudioPlayerConfig,
  avatar: sanitizeAvatarConfig,
  'video-player': sanitizeVideoPlayerConfig,
  'hero-banner': sanitizeHeroBannerConfig,
  fab: sanitizeFabConfig,
  'cookie-consent': sanitizeCookieConsentConfig,
  'share-bar': sanitizeShareBarConfig,
  'rich-tooltip': sanitizeRichTooltipConfig,
  'countdown-clock': sanitizeCountdownClockConfig,
  'countdown-digital': sanitizeCountdownDigitalConfig,
  'avatar-group': sanitizeAvatarGroupConfig,
  'lightbox-gallery': sanitizeLightboxGalleryConfig,
  'chart-bar': sanitizeChartBarConfig,
  'map-pin': sanitizeMapPinConfig,
  'color-picker': sanitizeColorPickerConfig,
  'app-launcher': sanitizeAppLauncherConfig,
  eventos: sanitizeEventosConfig,
  realty: sanitizeRealtyConfig,
  academy: sanitizeAcademyConfig,
  blogs: sanitizeBlogsConfig,
  gov: sanitizeGovConfig,
  seller: sanitizeSellerConfig,
  storefront: sanitizeStorefrontConfig,
  'travel-shell': sanitizeTravelShellConfig,
  ehr: sanitizeEhrConfig,
  'booking-wizard': sanitizeBookingWizardConfig,
  'form-stepper': sanitizeFormStepperConfig,
  'data-grid': sanitizeDataGridConfig,
  'search-box': sanitizeSearchBoxConfig,
  separator: sanitizeSeparatorConfig,
};

const SANITIZADORES: Readonly<Record<string, (config: unknown) => unknown>> = Object.fromEntries(
  Object.entries(CRUDOS).map(([nombre, crudo]) => [nombre, createConfigInputTransform(crudo as ConfigInputSanitizer<object>)]),
);

type Config = Record<string, unknown>;

const esObjeto = (v: unknown): v is Config => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Un campo dentro del `config`: sus claves, con `[]` por «cada ítem de la lista». */
type Ruta = readonly string[];

const texto = (ruta: Ruta): string => ruta.join('.').replaceAll('.[]', '[]');

/**
 * Cada campo que vive DENTRO de otro —de un ítem de una lista, o de un objeto—, a cualquier
 * profundidad: `slides[].label`, `items[].children[].label`. Las claves de primer nivel no
 * entran: las mira «cada clave que viaja mueve la salida».
 *
 * Es recursivo a propósito (CMS#180): con un solo nivel, un sanitizador que tira los NIETOS de
 * un árbol (`tree-view`) dejaba este gate en verde — medido por la tanda C.
 */
function rutasInternas(valor: unknown, ruta: Ruta): Ruta[] {
  if (Array.isArray(valor)) {
    const items = valor.filter(esObjeto);
    const campos = [...new Set(items.flatMap((item) => Object.keys(item)))];
    return campos.flatMap((campo) => {
      const suya = [...ruta, '[]', campo];
      return [suya, ...items.flatMap((item) => rutasInternas(item[campo], suya))];
    });
  }
  if (esObjeto(valor)) {
    return Object.keys(valor).flatMap((campo) => {
      const suya = [...ruta, campo];
      return [suya, ...rutasInternas(valor[campo], suya)];
    });
  }
  return [];
}

/** Las rutas internas de un `config`, sin repetir. */
function camposInternos(config: Config): Ruta[] {
  const vistas = new Map<string, Ruta>();
  for (const [clave, valor] of Object.entries(config)) {
    for (const ruta of rutasInternas(valor, [clave])) vistas.set(texto(ruta), ruta);
  }
  return [...vistas.values()];
}

/** `valor` sin el campo de `ruta` (en cada ítem, si la ruta cruza una lista). */
function sinCampo(valor: unknown, ruta: Ruta): unknown {
  const [cabeza, ...resto] = ruta;
  if (cabeza === undefined) return valor;
  if (cabeza === '[]') return Array.isArray(valor) ? valor.map((item) => sinCampo(item, resto)) : valor;
  if (!esObjeto(valor)) return valor;
  if (resto.length === 0) {
    const copia = { ...valor };
    delete copia[cabeza];
    return copia;
  }
  return { ...valor, [cabeza]: sinCampo(valor[cabeza], resto) };
}

/** Los campos internos cuya ausencia NO mueve la salida de `sanitizar`: los que se tiran. */
function camposMuertos(config: Config, sanitizar: (config: Config) => string): string[] {
  const completa = sanitizar(config);
  return camposInternos(config)
    .filter((ruta) => sanitizar(sinCampo(config, ruta) as Config) === completa)
    .map(texto);
}

describe('contrato SynHost: cada sanitizador, ejecutado con el config que emite su vista', () => {
  it('cada elemento del contrato tiene su sanitizador en esta tabla, y al revés', () => {
    const nombres = ELEMENTOS_SYNHOST.map((e) => e.nombre);

    expect(nombres.length).toBeGreaterThan(0);
    expect(nombres.filter((n) => !(n in SANITIZADORES))).toEqual([]);
    expect(Object.keys(SANITIZADORES).filter((n) => !nombres.includes(n))).toEqual([]);
  });

  for (const elemento of ELEMENTOS_SYNHOST) {
    describe(elemento.nombre, () => {
      const ejemplo = elemento.ejemplo as unknown as Config;
      // Se ejecuta con el atributo como llega: una cadena JSON.
      const salida = (config: Config) => JSON.stringify(SANITIZADORES[elemento.nombre]?.(JSON.stringify(config)) ?? null);

      it('la muestra del CMS ejercita todos los campos del record, los de sus listas incluidos', () => {
        expect(elemento.campos.filter((campo) => !(campo in ejemplo))).toEqual([]);

        const listas = elemento.listas as Readonly<Record<string, readonly string[]>>;
        const sinViajar = Object.entries(listas).flatMap(([campo, internos]) => {
          const items = Array.isArray(ejemplo[campo]) ? (ejemplo[campo] as unknown[]).filter(esObjeto) : [];
          return internos.filter((i) => !items.some((item) => i in item)).map((i) => `${campo}[].${i}`);
        });
        expect(sinViajar).toEqual([]);
      });

      it('cada clave que viaja mueve la salida del sanitizador', () => {
        const completa = salida(ejemplo);
        const muertas = Object.keys(ejemplo)
          .filter((clave) => !CLAVES_DE_ENVOLTURA_SYNHOST.includes(clave as never))
          .filter((clave) => {
            const sin = { ...ejemplo };
            delete sin[clave];
            return salida(sin) === completa;
          });

        expect(muertas).toEqual([]);
      });

      it('cada campo de un ítem de lista mueve la salida del sanitizador, a cualquier profundidad', () => {
        // Red de seguridad por el vacío: el recorrido tiene que encontrar, al menos, los campos
        // de los ítems que el contrato declara. Un recorrido roto que no ve nada daría verde.
        const vistos = camposInternos(ejemplo).map(texto);
        const declarados = Object.entries(elemento.listas as Readonly<Record<string, readonly string[]>>)
          .flatMap(([campo, internos]) => internos.map((i) => `${campo}[].${i}`));
        expect(declarados.filter((d) => !vistos.includes(d))).toEqual([]);

        expect(camposMuertos(ejemplo, salida)).toEqual([]);
      });
    });
  }
});

/**
 * El gate de arriba, contra un fixture propio de DOS niveles (CMS#180). Ningún elemento del
 * contrato tiene todavía una lista dentro de otra, así que sin esto el recorrido recursivo no lo
 * ejercita nadie: con el de un solo nivel, el sanitizador que tira los nietos pasaba en verde.
 */
describe('contrato SynHost: el gate de los campos internos, contra un árbol de dos niveles', () => {
  const arbol: Config = {
    culture: 'es-CO',
    items: [
      { label: 'Colombia', children: [{ label: 'Antioquia', href: '/co/ant' }, { label: 'Cundinamarca' }] },
      { label: 'México' },
    ],
  };
  const comoCable = (resultado: unknown) => JSON.stringify(resultado ?? null);
  const fiel = (config: Config) => comoCable(config['items']);
  const tiraLosNietos = (config: Config) =>
    comoCable(
      (config['items'] as Config[]).map((item) => ({
        label: item['label'],
        children: Array.isArray(item['children']) ? item['children'].map(() => ({})) : undefined,
      })),
    );

  it('el recorrido encuentra los campos de los nietos', () => {
    expect(camposInternos(arbol).map(texto)).toEqual([
      'items[].label',
      'items[].children',
      'items[].children[].label',
      'items[].children[].href',
    ]);
  });

  it('un sanitizador que tira los nietos se pone rojo, campo por campo', () => {
    expect(camposMuertos(arbol, tiraLosNietos)).toEqual(['items[].children[].label', 'items[].children[].href']);
  });

  it('uno que los conserva no', () => {
    expect(camposMuertos(arbol, fiel)).toEqual([]);
  });
});

// ── El gate de vocabulario: lo que el editor ELIGE ↔ lo que el elemento PINTA (CMS#181) ──────────
//
// Los gates de arriba miran CLAVES: que cada una viaje y se lea. Éste mira VALORES. Un selector del
// ElementType (`position`, `layout`, `platforms`…) ofrece al editor una lista cerrada, y el
// elemento sabe pintar otra: en 20 piezas migradas salió la misma clase de defecto una y otra vez
// —`DTSelectSwatchShape` ofrece `swatch/chip/dot/circle` y el elemento pinta `square/circle/pill`—,
// y lo que no casa cae al valor por defecto SIN ERROR. El editor elige y no pasa nada.
//
// Las dos mitades salen del código, no de una lista:
//   · lo que el editor puede elegir, del contrato: el CMS pasa cada prevalor de uSync por el
//     resolver REAL (`ContratoSynHostTests`) y escribe lo que VIAJA — `twitter` llega como `x`,
//     `bottom-start` como `bottom`. Cruzar los prevalores crudos acusaría a quien traduce bien;
//   · lo que el elemento pinta, EJECUTANDO su sanitizador: un valor que sobrevive es uno que pinta.
//     Por eso el sanitizador de todo campo-selector CIERRA su vocabulario (`coerceStringEnumInput`
//     con la misma lista que usa el componente): uno que deja pasar cualquier cadena no dice qué
//     pinta, y el gate lo rechaza en vez de dar por buena una lista infinita.
//
// La dirección contraria —el elemento pinta algo que el editor no puede elegir— necesita
// ENUMERAR el vocabulario, y una ejecución sólo responde sí o no. Los candidatos salen de la
// fuente del elemento (sus literales e identificadores, y los de los ficheros que importa por ruta
// relativa) y el sanitizador decide cuáles acepta. Lo que el gate NO ve, dicho: un vocabulario que
// viva en otro paquete (`@synergos/shared`). Por eso exige que todo valor que viaja y el elemento
// acepta esté ESCRITO en esa fuente — si no, la segunda dirección estaría ciega y lo dice.

/** Un valor que ningún elemento pinta: si el sanitizador lo deja pasar, su vocabulario está abierto. */
const CENTINELA = 'valor-que-ningun-elemento-pinta';

/** Lo que el gate encontró en un selector. */
interface CruceDeSelector {
  readonly clave: string;
  readonly noViaja: boolean;
  readonly abierto: boolean;
  /** Valores que viajan, el elemento acepta y su fuente no escribe: la segunda dirección, ciega. */
  readonly fueraDeLaFuente: readonly string[];
  /** Lo que el editor puede elegir y el elemento no pinta (por su nombre en el editor). */
  readonly sobra: readonly string[];
  /** Lo que el elemento pinta y ningún prevalor hace llegar. */
  readonly falta: readonly string[];
}

/** Un desajuste tal como se escribe en la línea base. */
interface Desajuste {
  readonly noViaja?: true;
  readonly sobra?: readonly string[];
  readonly falta?: readonly string[];
}

/** `toasts[].variant` → `['toasts', '[]', 'variant']`; `platforms[]` → `['platforms', '[]']`. */
function segmentos(campo: string): Ruta {
  return campo.split('.').flatMap((s) => (s.endsWith('[]') ? [s.slice(0, -2), '[]'] : [s]));
}

/**
 * `valor` con `nuevo` puesto en `ruta`: en cada ítem si la ruta cruza una lista, y como lista de
 * uno si la ruta ACABA en una lista (un selector múltiple: el editor marcó sólo ése).
 */
function conValor(valor: unknown, ruta: Ruta, nuevo: string): unknown {
  const [cabeza, ...resto] = ruta;
  if (cabeza === undefined) return nuevo;
  if (cabeza === '[]') {
    if (resto.length === 0) return [nuevo];
    return Array.isArray(valor) ? valor.map((item) => conValor(item, resto, nuevo)) : valor;
  }
  const objeto = esObjeto(valor) ? valor : {};
  return { ...objeto, [cabeza]: conValor(objeto[cabeza], resto, nuevo) };
}

/** Las cadenas que hay en `ruta` (en cada ítem, si cruza una lista). */
function valoresEn(valor: unknown, ruta: Ruta): string[] {
  const [cabeza, ...resto] = ruta;
  if (cabeza === undefined) return typeof valor === 'string' ? [valor] : [];
  if (cabeza === '[]') return Array.isArray(valor) ? valor.flatMap((item) => valoresEn(item, resto)) : [];
  return esObjeto(valor) ? valoresEn(valor[cabeza], resto) : [];
}

/**
 * ¿El sanitizador deja pasar `valor` en `ruta`? Se ejecuta con el `ejemplo` del contrato —el
 * `config` real de la vista— cambiando sólo ese campo, y como llega el atributo: una cadena JSON.
 */
function acepta(sanitizar: (config: unknown) => unknown, ejemplo: Config, ruta: Ruta, valor: string): boolean {
  const entrada = conValor(ejemplo, ruta, valor);
  if (!valoresEn(entrada, ruta).includes(valor)) {
    throw new Error(`la muestra no trae dónde poner «${valor}» en ${ruta.join('.')}: el gate no puede probarlo`);
  }
  return valoresEn(sanitizar(JSON.stringify(entrada)), ruta).includes(valor);
}

/**
 * Literales (comillas simples, dobles, plantillas sin interpolar) e identificadores de una fuente.
 *
 * Una plantilla se consume ENTERA, con sus `${…}`, y sólo cuenta si no interpola. Antes el patrón
 * no podía cruzar un `$`: en una plantilla interpolada (el `circulo()` del set de iconos, UI#89)
 * su comilla de cierre se emparejaba con la siguiente del fichero y se tragaba todo lo de en medio,
 * en silencio — el vocabulario entero salía «fuera de la fuente».
 */
function candidatosDe(fuente: string): Set<string> {
  const vistos = new Set<string>();
  for (const m of fuente.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`|\b([A-Za-z_][\w$]*)\b/g)) {
    if (m[3] !== undefined && m[3].includes('${')) continue;
    const candidato = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (candidato.length > 0 && candidato.length <= 60) vistos.add(candidato);
  }
  return vistos;
}

/** Cruza UN selector del contrato contra su sanitizador. Pura: la autoprueba la ejercita con fixtures. */
function cruzarSelector(
  clave: string,
  selector: SelectorSynHost,
  sanitizar: (config: unknown) => unknown,
  ejemplo: Config,
  minados: ReadonlySet<string>,
): CruceDeSelector {
  const vacio = { clave, abierto: false, fueraDeLaFuente: [], sobra: [], falta: [] };
  if (selector.campo === null) return { ...vacio, noViaja: true };

  const ruta = segmentos(selector.campo);
  const viajan = [...new Set(selector.valores.map((v) => v.viaja).filter((v): v is string => v !== null))];
  if (acepta(sanitizar, ejemplo, ruta, CENTINELA)) return { ...vacio, noViaja: false, abierto: true };

  const aceptados = [...new Set([...minados, ...viajan])].filter((c) => acepta(sanitizar, ejemplo, ruta, c)).sort();
  const sobra = [...new Set(selector.valores.filter((v) => v.viaja === null || !aceptados.includes(v.viaja)).map((v) => v.editor))].sort();

  return {
    clave,
    noViaja: false,
    abierto: false,
    fueraDeLaFuente: viajan.filter((v) => aceptados.includes(v) && !minados.has(v)).sort(),
    sobra,
    falta: aceptados.filter((a) => !viajan.includes(a)),
  };
}

/** Un cruce como desajuste de línea base; `null` si el editor y el elemento dicen lo mismo. */
function comoDesajuste(cruce: CruceDeSelector): Desajuste | null {
  if (cruce.noViaja) return { noViaja: true };
  if (cruce.sobra.length === 0 && cruce.falta.length === 0) return null;
  return { sobra: cruce.sobra, falta: cruce.falta };
}

/** `apps/elements` del árbol FUENTE (el spec corre compilado en `.test-out/`). */
function raizDeElementos(): string {
  for (const base of [process.cwd(), join(process.cwd(), 'platforms', 'angular')]) {
    const dir = join(base, 'apps', 'elements');
    if (existsSync(join(dir, 'contrato-synhost.spec.ts'))) return dir;
  }
  throw new Error(`No se encontró apps/elements desde ${process.cwd()}: el gate de vocabulario no puede leer las fuentes.`);
}

/** Los `.ts` de los elementos, sin specs. */
function fuentesTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || e.name === 'node_modules') return [];
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return fuentesTs(ruta);
    return e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') ? [ruta] : [];
  });
}

/** La fuente del elemento que declara `sanitizador`, más los ficheros que importa por ruta relativa. */
function fuenteDe(sanitizador: string, ficheros: readonly string[]): string {
  const declaran = ficheros.filter((f) => readFileSync(f, 'utf8').includes(`export function ${sanitizador}(`));
  if (declaran.length !== 1) {
    throw new Error(`${declaran.length} ficheros declaran \`export function ${sanitizador}(\`: tiene que ser uno.`);
  }
  const propio = readFileSync(declaran[0], 'utf8');
  const importados = [...propio.matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)]
    .map((m) => resolve(dirname(declaran[0]), `${m[1]}.ts`))
    .filter((f) => existsSync(f))
    .map((f) => readFileSync(f, 'utf8'));
  return [propio, ...importados, ...delDesignSystem(propio)].join('\n');
}

/**
 * Los ficheros de `@synergos/shared` de donde salen los NOMBRES que el elemento importa de él.
 *
 * Era el punto ciego que este gate declaraba («un vocabulario que viva en otro paquete»), y dejó
 * de ser teórico con el set de iconos (UI#89): `icon-label` cierra su vocabulario con
 * `NOMBRES_DE_ICONO`, que vive en el design system. Se sigue el `export { … } from './…'` del
 * índice del paquete hasta el fichero que lo declara; un nombre que no se encuentra no aporta
 * candidatos (y el gate lo dice como «fuera de la fuente», que es lo correcto).
 */
function delDesignSystem(fuente: string): string[] {
  const indice = resolve(raizDeElementos(), '..', '..', 'libs', 'shared', 'src', 'index.ts');
  if (!existsSync(indice)) return [];
  const nombres = [...fuente.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@synergos\/shared'/g)]
    .flatMap((m) => m[1].split(','))
    .map((n) => n.replace(/^\s*type\s+/, '').split(/\s+as\s+/)[0].trim())
    .filter((n) => n.length > 0);
  const textoDelIndice = readFileSync(indice, 'utf8');
  const ficheros = new Set<string>();
  for (const m of textoDelIndice.matchAll(/export\s*\{([^}]*)\}\s*from\s*'(\.\/[^']+)'/g)) {
    const exportados = m[1].split(',').map((n) => n.replace(/^\s*type\s+/, '').trim());
    if (exportados.some((n) => nombres.includes(n))) {
      const fichero = resolve(dirname(indice), `${m[2]}.ts`);
      if (existsSync(fichero)) ficheros.add(fichero);
    }
  }
  return [...ficheros].map((f) => readFileSync(f, 'utf8'));
}

const VARIABLE_PARA_ACTUALIZAR = 'SYNERGOS_ACTUALIZAR_VOCABULARIO';

describe('contrato SynHost: lo que el editor elige en un selector ↔ lo que el elemento pinta (CMS#181)', () => {
  let memo: { cruces: CruceDeSelector[]; lineaBase: string } | undefined;
  const cruces = () => {
    if (memo) return memo;
    const raiz = raizDeElementos();
    const ficheros = fuentesTs(raiz);
    const lista: CruceDeSelector[] = [];
    for (const elemento of ELEMENTOS_SYNHOST) {
      const selectores: readonly SelectorSynHost[] = elemento.selectores;
      if (selectores.length === 0) continue;
      const crudo = CRUDOS[elemento.nombre];
      const sanitizar = SANITIZADORES[elemento.nombre];
      if (!crudo || !sanitizar) throw new Error(`${elemento.nombre}: sin sanitizador en la tabla`);
      const minados = candidatosDe(fuenteDe(crudo.name, ficheros));
      for (const selector of selectores) {
        // Un selector de datos (la fuente de un listado, CMS#196) elige filas, no vocabulario.
        if (selector.deDatos) continue;
        lista.push(cruzarSelector(`${elemento.nombre}.${selector.propiedad}`, selector, sanitizar, elemento.ejemplo as unknown as Config, minados));
      }
    }
    memo = { cruces: lista, lineaBase: join(raiz, 'vocabulario-synhost.linea-base.json') };
    return memo;
  };

  it('cruza cada selector del contrato, y alguno (red de seguridad por el vacío)', () => {
    const enElContrato = ELEMENTOS_SYNHOST.flatMap((e) =>
      e.selectores.filter((s) => !s.deDatos).map((s) => `${e.nombre}.${s.propiedad}`),
    );

    expect(enElContrato.length).toBeGreaterThan(0);
    expect(cruces().cruces.map((c) => c.clave)).toEqual(enElContrato);
    expect(cruces().cruces.filter((c) => !c.noViaja).length).toBeGreaterThan(0);
  });

  it('ningún sanitizador deja abierto el vocabulario de un selector', () => {
    // Trinquete absoluto: hoy todos lo cierran. Uno abierto «acepta» cualquier cosa, y entonces el
    // gate no puede decir qué pinta el elemento — daría por buena cualquier opción del editor.
    expect(cruces().cruces.filter((c) => c.abierto).map((c) => c.clave)).toEqual([]);
  });

  it('el vocabulario de cada selector está escrito en la fuente de su elemento', () => {
    expect(cruces().cruces.filter((c) => c.fueraDeLaFuente.length > 0).map((c) => `${c.clave}: ${c.fueraDeLaFuente.join(', ')}`)).toEqual([]);
  });

  it('los desajustes son EXACTAMENTE los de la línea base, en los dos sentidos', () => {
    const { cruces: lista, lineaBase } = cruces();
    const hoy = Object.fromEntries(
      lista.flatMap((c) => {
        const d = comoDesajuste(c);
        return d ? [[c.clave, d] as const] : [];
      }),
    );

    if (process.env[VARIABLE_PARA_ACTUALIZAR] === '1') {
      const fichero = {
        comentario:
          'Los selectores donde lo que el editor puede elegir (después del resolver) y lo que el elemento pinta no casan (CMS#181). '
          + '`sobra`: lo elige el editor y el elemento no lo pinta (cae a su valor por defecto); `falta`: lo pinta el elemento y el editor no puede elegirlo; '
          + '`noViaja`: el selector no llega al elemento. Cada entrada es una decisión de producto pendiente: quitar la opción del DataType (schema, ADR 0008) '
          + 'o que el elemento la aprenda. Se regenera con SYNERGOS_ACTUALIZAR_VOCABULARIO=1 y el diff va en el commit que lo causó.',
        desajustes: hoy,
      };
      writeFileSync(lineaBase, `${JSON.stringify(fichero, null, 2)}\n`);
      return;
    }

    const escrita = (JSON.parse(readFileSync(lineaBase, 'utf8')) as { desajustes: Record<string, Desajuste> }).desajustes;
    const nuevos = Object.keys(hoy).filter((k) => JSON.stringify(hoy[k]) !== JSON.stringify(escrita[k]));
    const resueltos = Object.keys(escrita).filter((k) => !(k in hoy));

    // Las dos direcciones en UNA aserción: con dos, el primer rojo escondía el segundo.
    expect(
      [
        ...nuevos.map((k) => `${k}: hoy ${JSON.stringify(hoy[k])}, la línea base dice ${JSON.stringify(escrita[k] ?? null)}`),
        ...resueltos.map((k) => `${k}: la línea base dice ${JSON.stringify(escrita[k])} y ya no pasa — bajalo`),
      ],
      'Lo que el editor elige y lo que el elemento pinta dejaron de ser lo que dice la línea base. Un desajuste nuevo se '
        + 'arregla —que el resolver traduzca si hay equivalente obvio, o que producto decida si la opción se quita del DataType '
        + 'o el elemento la aprende— o, si se decidió convivir, se anota; uno resuelto se baja. Las dos cosas con '
        + `${VARIABLE_PARA_ACTUALIZAR}=1, y el diff va en el commit que lo causó.`,
    ).toEqual([]);
  });
});

/**
 * El gate de vocabulario contra fixtures propios: un sanitizador que cierra, uno que no, un
 * selector que cae dentro de una lista y uno que no viaja. Sin esto, «sobra», «falta» y «abierto»
 * sólo los ejercitarían los casos de hoy — y un cruce roto que devuelve listas vacías daría verde.
 */
describe('contrato SynHost: el gate de vocabulario, contra fixtures', () => {
  const ejemplo: Config = { culture: 'es-CO', lado: 'arriba', avisos: [{ texto: 'Hola', tono: 'info' }] };
  const cierra = (config: unknown) => {
    const c = JSON.parse(config as string) as Config;
    const lado = ['arriba', 'abajo', 'izquierda'].includes(c['lado'] as string) ? c['lado'] : undefined;
    const avisos = (c['avisos'] as Config[]).map((a) => ({ ...a, tono: ['info', 'error'].includes(a['tono'] as string) ? a['tono'] : undefined }));
    return { lado, avisos };
  };
  const abre = (config: unknown) => JSON.parse(config as string) as unknown;
  const minados = new Set(['arriba', 'abajo', 'izquierda', 'info', 'error', 'cierra']);
  const selector = (campo: string | null, valores: [string, string | null][]): SelectorSynHost => ({
    propiedad: 'p',
    dataType: 'DT',
    multiple: false,
    campo,
    valores: valores.map(([editor, viaja]) => ({ editor, viaja })),
  });

  it('acusa lo que sobra (también lo que el resolver tira) y lo que falta', () => {
    const cruce = cruzarSelector('x.p', selector('lado', [['top', 'arriba'], ['bottom', 'abajo'], ['center', 'centro'], ['start', null]]), cierra, ejemplo, minados);

    expect(cruce.abierto).toBe(false);
    expect(cruce.sobra).toEqual(['center', 'start']);
    expect(cruce.falta).toEqual(['izquierda']);
    expect(comoDesajuste(cruce)).toEqual({ sobra: ['center', 'start'], falta: ['izquierda'] });
  });

  it('cruza un selector que cae DENTRO de una lista', () => {
    const cruce = cruzarSelector('x.p', selector('avisos[].tono', [['info', 'info'], ['neutral', 'neutral']]), cierra, ejemplo, minados);

    expect(cruce.sobra).toEqual(['neutral']);
    expect(cruce.falta).toEqual(['error']);
  });

  it('no da por bueno un sanitizador que deja pasar cualquier cosa', () => {
    expect(cruzarSelector('x.p', selector('lado', [['top', 'arriba']]), abre, ejemplo, minados).abierto).toBe(true);
  });

  it('un selector que no viaja es un desajuste, y uno que casa no lo es', () => {
    expect(comoDesajuste(cruzarSelector('x.p', selector(null, [['v', null]]), cierra, ejemplo, minados))).toEqual({ noViaja: true });
    const exacto = selector('lado', [['a', 'arriba'], ['b', 'abajo'], ['c', 'izquierda']]);
    expect(comoDesajuste(cruzarSelector('x.p', exacto, cierra, ejemplo, minados))).toBeNull();
  });

  it('dice cuándo el vocabulario no está en la fuente minada', () => {
    const cruce = cruzarSelector('x.p', selector('lado', [['a', 'arriba']]), cierra, ejemplo, new Set(['abajo']));

    expect(cruce.fueraDeLaFuente).toEqual(['arriba']);
  });

  it('mina literales e identificadores de una fuente', () => {
    expect([...candidatosDe(`type P = 'top' | "bottom-end";\nconst X = { arrow_up: 1 };`)]).toEqual(
      expect.arrayContaining(['top', 'bottom-end', 'arrow_up', 'X']),
    );
  });
});
